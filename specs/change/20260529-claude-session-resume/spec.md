---
id: 20260529-claude-session-resume
name: Claude CLI Session Resume
status: proposed
created: '2026-05-29'
---

## Overview

Every chat turn in a conversation spawns a fresh, context-free `claude -p`
process and re-sends the entire conversation as a recomposed transcript. The
process never resumes the prior turn's Claude Code session, so each turn pays
to re-read project files, re-process the full history, and forfeits any
cross-turn prompt-cache hits. On long conversations the per-turn payload grows
O(N) in turns. (Reported externally: "every message starts a new Claude Code
session, re-sends prompt/history, re-reads project files → token waste.")

This is a deliberate trade-off, not a defect — the recompose-transcript model
buys uniform behavior across ~15 heterogeneous adapters, full daemon control of
per-turn prompt composition, and a single daemon-owned source of truth. But the
project's cited architectural inspiration, [multica](https://github.com/multica-ai/multica),
runs the *same* `claude -p --output-format stream-json` base invocation and yet
resumes the CLI's own session via `--resume <session_id>` with a small set of
guards. multica demonstrates that session resume is compatible with this daemon
architecture when the invalidation edges are handled explicitly.

Goal: add an **opt-in, Claude-first, best-effort** session-resume path that, on
a qualifying follow-up turn, passes `--resume <session_id>` and sends only the
latest user message instead of the full transcript — while never removing the
transcript path that remains the correct behavior for every other adapter and
for any turn that fails the resume guards.

Constraints:
- Do not regress any existing behavior. Resume is best-effort: when a guard
  fails, the capability is absent, or `--resume` is rejected at runtime, the
  daemon falls back to today's full-transcript spawn for that turn.
- Do not break the interactive `stream-json` / `AskUserQuestion` machinery
  (`pendingHostAnswers`, `POST /api/runs/:id/tool-result`).
- Keep the daemon the source of truth: the stored session pointer is a cache
  keyed on daemon-owned conversation state, never the authoritative history.
- Claude-only in v1. Other adapters keep `resumesSessionViaCli` unset and the
  transcript path unchanged.
- Honor the UI/CLI dual-track rule: a force-fresh control must exist on both
  the web composer and the `od` run path.

Open questions:
- Should resume default on for Claude, or ship behind a per-project opt-in for
  one release while we gather token-savings telemetry? (Leaning: default on,
  with a force-fresh escape hatch — see Design Decisions.)
- Should a resumed turn show a small "continuing session" affordance in the
  chat UI, or stay invisible? (Leaning: telemetry only in v1, no UI badge.)
- Do we extend the same machinery to other resumable CLIs (codex, cursor-agent)
  in a follow-up, gated per-adapter? (Out of scope here.)

## Research

### Existing System

- Claude's `buildArgs` emits no session flag; every spawn is a cold start.
  Source: `apps/daemon/src/runtimes/defs/claude.ts:45-74`
- The daemon already parses `session_id` from Claude's `system/init` line and
  emits it as a `status` event, but it is only streamed to the client.
  Source: `apps/daemon/src/claude-stream.ts:91`
- `session_id` is never persisted: the persisted-event mapper drops it, and the
  `messages` table has no session column.
  Source: `apps/daemon/src/db.ts:86-103` (schema), the status-event branch of
  `daemonAgentPayloadToPersistedAgentEvent` in `apps/daemon/src/server.ts`
- Per-turn context is recomposed client-side into a markdown transcript and
  sent as `message`; `currentPrompt` carries only the latest user turn.
  Source: `apps/web/src/providers/daemon.ts:171-185` (`buildDaemonTranscript`),
  `:326-330` (call site)
- The daemon already has the seam to send only the latest turn: when
  `def.resumesSessionViaCli === true`, `composeChatUserRequestForAgent` skips
  the transcript and sends `currentPrompt`.
  Source: `apps/daemon/src/server.ts:2542-2571`, `:10985-10989`
- `RuntimeContext.hasPriorAssistantTurn` is already computed per run and passed
  into `buildArgs` — the hook a resume flag would read.
  Source: `apps/daemon/src/runtimes/types.ts:19-29`, `apps/daemon/src/server.ts:11322,11376`
- The transcript is already scoped to the active agent and sanitized for prior
  `<question-form>` markup — work that only applies to the daemon-owned
  transcript, not to a CLI-held session.
  Source: `apps/web/src/providers/daemon.ts:127-136` (`scopeHistoryToAgent`),
  `:150-169` (`sanitizePriorAssistantTurnForTranscript`)
- The capability-probe pattern (probe `claude -p --help`, set a capability flag,
  gate the arg) already exists for `--include-partial-messages` / `--add-dir`.
  Source: `apps/daemon/src/runtimes/defs/claude.ts:16-24,58-71`

### Reference Implementation (multica)

multica runs the same base invocation and resumes via `--resume`, persisting
and re-injecting a per-(agent, issue) session id with guards that map directly
onto OD's edges:

- Same base argv, plus conditional `--resume`.
  Source: `multica/server/pkg/agent/claude.go:483-519` (`--resume` at `:513-514`)
- Resume only when not a forced rerun, and only when the prior session ran on
  the **same runtime** as the claiming task; excludes poisoned sessions; falls
  back to the last task that recorded a session id.
  Source: `multica/server/internal/handler/daemon.go:1306-1360`
- session id captured from the `system` message and pinned mid-flight to the
  task row.
  Source: `multica/server/internal/daemon/client.go:248` (`PinTaskSession`)
- A "Focus on THIS comment" prompt guard defends against the resumed session
  inheriting the prior turn's completion marker.
  Source: `multica/server/internal/daemon/prompt.go`

### Why OD diverged (product characteristics that shape this design)

OD is a synchronous, interactive design-chat, not an async issue/task runner.
These traits are why resume must be guarded rather than unconditional, and why
it stays Claude-first and opt-out-able:

1. **Interactive mid-turn tools.** OD keeps `stream-json` stdin open to answer
   `AskUserQuestion` with a real `tool_result`. multica disables it
   (`--disallowedTools AskUserQuestion`). Resume must not disturb this path.
2. **Per-turn prompt rewriting.** OD recomposes the system prompt + skills +
   memory + design system into the `# Instructions` block of the stdin user
   message every turn. Because the instructions ride the stdin message (not a
   one-time `--append-system-prompt`), they still reach the model on a resumed
   turn — so OD keeps prompt control *and* gets resume. This is the key reason
   OD can adopt resume where the antigravity `-c` path could not: `agy -c`
   activated an internal agentic loop OD could not steer
   (`apps/daemon/src/runtimes/defs/antigravity.ts:189-204`); `claude --resume`
   still consumes the fresh stdin turn.
3. **Mid-conversation agent switching.** OD lets a user switch active agent per
   conversation; a Claude session id is meaningless to Codex. Mirror multica's
   runtime-match guard.
4. **User-editable history.** OD supports retry-from-message and editing prior
   turns. Claude's session is an immutable replay; once OD's history diverges
   from what produced the session, the session is stale. multica has no direct
   analog, so OD needs an extra epoch guard.
5. **Heterogeneous fleet.** Most adapters have no compatible resume. Resume is a
   per-adapter opt-in; the transcript path stays the default everywhere else.

### Constraints & Dependencies

- Contracts-first: any new request/response field lands in
  `packages/contracts` before web/daemon wiring (`AGENTS.md` contract rule).
- SQLite migration discipline: additive, backward-compatible schema only.
- Capability probe must gate `--resume` so forks lacking it (e.g. openclaude)
  never receive it (`fallbackBins` includes `openclaude`).

### Key References

- `apps/daemon/src/runtimes/defs/claude.ts`
- `apps/daemon/src/claude-stream.ts:91`
- `apps/daemon/src/server.ts:2542-2571,10985-10989,11322,11376`
- `apps/daemon/src/runtimes/types.ts:19-29,45-54,149-155`
- `apps/web/src/providers/daemon.ts:127-185,326-330`
- `apps/daemon/src/db.ts:86-103,888-908,1031-1050`
- multica: `server/pkg/agent/claude.go`, `server/internal/handler/daemon.go:1306-1360`

## Design

### Architecture Overview

Three additions, all behind a Claude-only capability gate:

1. **Capture + persist** the Claude `session_id` (already parsed) keyed on
   `(conversationId, agentId)`, plus a `historyEpoch` snapshot and the run's
   `workDir`. Update on run success.
2. **Decide** at run start whether to resume: a pure `resolveResumeDecision()`
   helper that returns a `sessionId` only when every guard passes.
3. **Apply**: when resuming, `buildArgs` appends `--resume <id>` and the prompt
   composer sends only `currentPrompt` (existing `skipTranscript` seam) plus an
   anti-echo guard line. On runtime rejection, fall back to a transcript spawn.

```
turn N:   claude system/init → session_id  ──pin──▶ conversation_agent_session
                                                     (conv, agent, sid, epoch, wd)
turn N+1: resolveResumeDecision(conv, agent, epoch, forceFresh, caps)
            │ pass → buildArgs(+--resume sid) + skipTranscript + anti-echo guard
            │ fail → today's full-transcript cold spawn
          claude --resume rejects sid? → one retry: transcript cold spawn
```

### Change Scope

- `packages/contracts`: add `forceFreshSession?: boolean` to the chat/run
  request DTO; add `sessionResumed?: boolean` to run status/telemetry shape.
- `apps/daemon/src/db.ts`: new `conversation_agent_session` table + queries;
  stop stripping `session_id` so it reaches the pin path.
- `apps/daemon/src/runtimes/types.ts`: extend `RuntimeContext` with
  `resumeSessionId?: string`; add `supportsSessionResume` capability key.
- `apps/daemon/src/runtimes/defs/claude.ts`: probe `--resume`; emit it when
  `runtimeContext.resumeSessionId` is set.
- `apps/daemon/src/server.ts`: `resolveResumeDecision()`, pin-on-success,
  resume-aware `skipTranscript`, anti-echo guard line, runtime-rejection
  fallback.
- `apps/web/src/`: force-fresh control in the composer; bump epoch on history
  edit/retry.
- `apps/daemon/src/cli.ts`: `--fresh-session` flag on the run path (dual-track).

### Design Decisions

1. **Claude-only, capability-gated, opt-in per adapter.** Reuse the existing
   `resumesSessionViaCli` semantics so the transcript-skip seam and the resume
   flag travel together; other adapters are untouched.
2. **Store a pointer keyed on `(conversationId, agentId)`** — the OD analog of
   multica's per-(agent, issue) session. A dedicated small table avoids bloating
   `conversations` and makes the agent-switch guard a natural key miss.
3. **`historyEpoch` guard.** The conversation carries a monotonic epoch bumped
   whenever history is edited, truncated, or a turn is retried. The pinned
   session records the epoch it was produced under; a mismatch invalidates
   resume (Claude's immutable session would diverge from OD's edited history).
   This is OD's addition over multica.
4. **Best-effort with guaranteed fallback.** If `claude --resume` exits early
   reporting an unknown/invalid session, retry the same turn once without
   `--resume` and with the full transcript. Worst case equals today.
5. **Anti-echo guard, not transcript sanitization.** On a resumed turn the prior
   `<question-form>` lives in Claude's session, beyond reach of
   `sanitizePriorAssistantTurnForTranscript`. Replace that defense with a short
   instruction-block guard (multica's "Focus on THIS turn" analog) telling the
   model the prior form was already answered.
6. **Force-fresh is first-class and dual-surface.** Retry-from-message, history
   edits, an explicit composer toggle, and `od --fresh-session` all set
   `forceFreshSession`, mirroring multica's `ForceFreshSession`.

### Why this design

It captures multica's token win on the dominant path (Claude, linear
conversation) while preserving the four OD properties the transcript model was
protecting: interactive tools, per-turn prompt control, agent switching, and
editable history. The fallback and capability gate make it strictly
non-regressing, so it can ship default-on without a flag day.

### Test Strategy

Red-spec first at the cheapest layer that sees the symptom (daemon HTTP e2e),
per `AGENTS.md`:

- **Resume happy path (red on main).** Two turns, same conversation, same agent:
  assert turn 2 spawns with `--resume <sid-from-turn-1>` and that turn 2's stdin
  prompt does **not** contain the full transcript (only `currentPrompt`).
- **Agent-switch guard.** Turn 1 Claude, turn 2 after switching agent → no
  `--resume`; transcript path used.
- **Force-fresh.** Retry-from-message and `--fresh-session` → no `--resume`.
- **History-edit epoch guard.** Editing a prior turn bumps epoch → no `--resume`.
- **Runtime-rejection fallback.** Stub a `claude` that rejects `--resume` → the
  daemon retries with transcript and the run still succeeds.
- **Capability probe.** A `claude --help` without `--resume` → flag never sent.
- **Interactive intact.** An `AskUserQuestion` turn still resolves via
  `POST /api/runs/:id/tool-result` under resume.

Human verification (per `AGENTS.md`, two namespaced runtimes: `main` vs branch):
drive a multi-turn chat through production HTTP only; confirm continuity holds
and compare per-turn input-token counts (resume turn should drop sharply).

### Pseudocode

```ts
// server.ts — at run start, before buildArgs
function resolveResumeDecision(ctx): string | null {
  if (!agentDef.capabilities.supportsSessionResume) return null;
  if (chatBody.forceFreshSession) return null;
  if (!hasPriorAssistantTurn) return null;
  const row = getConversationAgentSession(db, conversationId, agentId);
  if (!row || row.agentId !== agentId) return null;          // agent-switch guard
  if (row.historyEpoch !== currentHistoryEpoch) return null; // edit guard
  return row.sessionId;
}

// claude.ts buildArgs
if (runtimeContext.resumeSessionId && caps.sessionResume) {
  args.push('--resume', runtimeContext.resumeSessionId);
}

// prompt composition
const skipTranscript = def.resumesSessionViaCli === true || resumeSessionId != null;

// on run success (mirrors multica PinTaskSession)
if (finalSessionId) upsertConversationAgentSession(db, {
  conversationId, agentId, sessionId: finalSessionId,
  historyEpoch: currentHistoryEpoch, workDir,
});

// runtime rejection
if (exitedWith('unknown session') && usedResume) {
  return respawnWithoutResumeAndFullTranscript();
}
```

### File Structure

- `specs/change/20260529-claude-session-resume/spec.md` (this file)
- (implementation, follow-up PR) contracts → db → runtime types → claude def →
  server orchestration → web composer → cli flag

## Plan

1. Land this spec (this PR).
2. Contracts: `forceFreshSession`, `sessionResumed`.
3. DB: `conversation_agent_session` table + queries; stop dropping `session_id`.
4. Runtime: `RuntimeContext.resumeSessionId`, `supportsSessionResume` probe,
   `--resume` in `claude.ts`.
5. Server: `resolveResumeDecision`, pin-on-success, resume-aware skipTranscript,
   anti-echo guard, rejection fallback.
6. Web + CLI: force-fresh control on both surfaces; epoch bump on history edit.
7. Tests per Test Strategy, then human verification.

## Notes

### Implementation

- Steps 2–6 ship as separate PRs after this spec is accepted; each carries its
  own red spec.
- Keep `resolveResumeDecision` a pure function for unit-testing the guard matrix
  without spawning a process.

### Verification

- `pnpm guard`, `pnpm typecheck`, `pnpm --filter @open-design/daemon test` per
  changed surface.
- Token-savings telemetry (`sessionResumed`, input-token delta) confirms the
  win that motivates the change.
