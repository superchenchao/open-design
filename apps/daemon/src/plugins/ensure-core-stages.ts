// Core quality-stage floor for design-artifact generation.
//
// Why: template / community plugins frequently declare a generate-only
// pipeline — `stages: [{ id: 'generate', atoms: ['file-write','live-artifact'] }]`
// — so they can ship a locked reference seed without re-running
// discovery. But `resolveAppliedPipeline` returns that declaration
// verbatim (`source: 'declared'`), so it REPLACES the core scenario
// pipeline. The `plan` (TodoWrite) and `critique` (5-dimension quality /
// anti-slop) stages then never run: the agent generates with no
// harness-driven critique loop and, at best, narrates a self-evaluation
// inline — unverifiable theater. Observed symptom: "using a plugin
// skipped the five-stage main flow — no todolist, no real anti-slop".
//
// This floor guarantees that any pipeline producing a code/document
// design artifact (a `generate` stage whose atoms include `file-write`
// or `live-artifact`) carries a `plan` and a `critique` stage, whether
// the artifact came from a free-form prompt (od-default / od-new-generation,
// which already declare both — a no-op here) or a template/plugin.
//
// Deliberately OUT OF SCOPE:
//   - Pure media generation (image/video/audio — generate atoms like
//     `image-generate` / `video-generate`) stays generate-only; a raw
//     image has nothing for critique-theater to score.
//   - `task-type` / `discovery` question forms are NOT injected: a
//     template already knows its task type and locked direction, and
//     re-raising those GenUI surfaces would interrogate the user for
//     answers the template already encodes.
//   - The injected `plan` carries only `todo-write`, NOT
//     `direction-picker`: a template's direction is fixed by its
//     reference seed, so we add the todolist without re-exploring
//     directions the template intentionally locked.
//
// Pure module — no fs / SQLite / network — so the daemon's apply path
// stays pure.

import type { PluginPipeline, PipelineStage } from '@open-design/contracts';

// Atoms whose presence in a `generate` stage mark the output as a
// code/document artifact that benefits from plan + critique.
const DESIGN_ARTIFACT_ATOMS = new Set(['file-write', 'live-artifact']);

// Mirrors the `plan` / `critique` stages declared by the bundled
// od-new-generation scenario, minus `direction-picker` (see header).
function buildPlanStage(): PipelineStage {
  return { id: 'plan', atoms: ['todo-write'] };
}
function buildCritiqueStage(): PipelineStage {
  return {
    id:     'critique',
    atoms:  ['critique-theater'],
    repeat: true,
    until:  'critique.score>=4 || iterations>=3',
  };
}

export interface EnsureCoreStagesInput {
  pipeline: PluginPipeline | undefined;
  taskKind: string;
}

// Returns the pipeline with `plan` + `critique` guaranteed when the
// pipeline produces a design artifact; otherwise returns it unchanged
// (same reference when nothing is injected).
export function ensureCoreQualityStages(input: EnsureCoreStagesInput): PluginPipeline | undefined {
  const { pipeline, taskKind } = input;
  if (!pipeline || !Array.isArray(pipeline.stages)) return pipeline;
  // Scope to the design-generation taskKind; migration / authoring /
  // media-generation flows own their own stage contracts.
  if (taskKind !== 'new-generation') return pipeline;

  const stages = pipeline.stages;
  const generateIdx = stages.findIndex(
    (s) => s.id === 'generate' && (s.atoms ?? []).some((a) => DESIGN_ARTIFACT_ATOMS.has(a)),
  );
  // Not a design-artifact generate pipeline (e.g. pure image/video media).
  if (generateIdx < 0) return pipeline;

  const hasStage = (id: string): boolean => stages.some((s) => s.id === id);
  const needPlan = !hasStage('plan');
  const needCritique = !hasStage('critique');
  if (!needPlan && !needCritique) return pipeline;

  const next: PipelineStage[] = [];
  for (const [i, stage] of stages.entries()) {
    if (i === generateIdx && needPlan) next.push(buildPlanStage());
    next.push(stage);
  }
  if (needCritique) next.push(buildCritiqueStage());

  return { ...pipeline, stages: next };
}
