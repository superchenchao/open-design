#!/usr/bin/env node
// One-shot backfill: fix project runs that produced an artifact on disk but
// were mis-recorded as `failed` (run_status='failed') because the agent
// process exited non-zero during teardown after the deliverable already
// landed. See classifyChatRunCloseStatus in apps/daemon/src/server.ts — going
// forward the daemon classifies these as `succeeded`; this script repairs the
// rows written before that fix.
//
// A row is repaired when its project directory under <dataDir>/projects/<id>/
// contains any `*.artifact.json` sidecar (the canonical on-disk success
// signal — there is no artifacts table in sqlite).
//
// Usage:
//   node --experimental-strip-types scripts/backfill-failed-runs-with-artifacts.ts --dry-run
//   node --experimental-strip-types scripts/backfill-failed-runs-with-artifacts.ts --data-dir /path/to/.od --dry-run
//   node --experimental-strip-types scripts/backfill-failed-runs-with-artifacts.ts --data-dir /path/to/.od
//
// STOP THE DAEMON FIRST so the WAL is flushed and this does not race a write.
// --dry-run prints the rows it would flip without writing. Re-running is
// idempotent (only rows still 'failed' are touched).

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');

interface BackfillDatabase {
  prepare: (sql: string) => {
    all: (...args: unknown[]) => unknown[];
    run: (...args: unknown[]) => { changes: number };
  };
  transaction: <T>(fn: (arg: T) => number) => (arg: T) => number;
  close: () => void;
}

// better-sqlite3 is a native module owned by the daemon workspace; resolve it
// from there (matching scripts/seed-test-projects.ts) rather than the root.
function loadBetterSqlite(): new (filename: string) => BackfillDatabase {
  const daemonRequire = createRequire(path.join(REPO_ROOT, 'apps', 'daemon', 'package.json'));
  return daemonRequire('better-sqlite3') as new (filename: string) => BackfillDatabase;
}

function parseArgs(argv: string[]): { dataDir: string; dryRun: boolean } {
  let dataDir = process.env.OD_DATA_DIR?.trim() || './.od';
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) continue;
    if (arg === '--dry-run') dryRun = true;
    else if (arg === '--data-dir') {
      const next = argv[i + 1];
      if (!next) throw new Error('--data-dir requires a path');
      dataDir = next;
      i++;
    } else if (arg.startsWith('--data-dir=')) {
      dataDir = arg.slice('--data-dir='.length);
    }
  }
  return { dataDir: path.resolve(dataDir), dryRun };
}

function projectHasArtifact(projectsRoot: string, projectId: string): boolean {
  const dir = path.join(projectsRoot, projectId);
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return false; // missing/vanished project dir — skip, not fatal
  }
  return entries.some((name) => name.endsWith('.artifact.json'));
}

function main() {
  const { dataDir, dryRun } = parseArgs(process.argv.slice(2));
  const dbPath = path.join(dataDir, 'app.sqlite');
  const projectsRoot = path.join(dataDir, 'projects');

  if (!fs.existsSync(dbPath)) {
    throw new Error(`No sqlite db at ${dbPath} (is --data-dir correct?)`);
  }

  const Database = loadBetterSqlite();
  const db = new Database(dbPath);
  try {
    const rows = db
      .prepare(
        `SELECT m.id AS messageId, c.project_id AS projectId
           FROM messages m
           JOIN conversations c ON c.id = m.conversation_id
          WHERE m.run_status = 'failed'`,
      )
      .all() as Array<{ messageId: string; projectId: string }>;

    const toFlip = rows.filter((row) => projectHasArtifact(projectsRoot, row.projectId));

    console.log(
      `Found ${rows.length} failed run row(s); ${toFlip.length} belong to projects with an artifact on disk.`,
    );
    const byProject = new Map<string, number>();
    for (const row of toFlip) {
      byProject.set(row.projectId, (byProject.get(row.projectId) ?? 0) + 1);
    }
    for (const [projectId, count] of byProject) {
      console.log(`  ${projectId}  (${count} row${count === 1 ? '' : 's'})`);
    }

    if (toFlip.length === 0) {
      console.log('Nothing to repair.');
      return;
    }

    if (dryRun) {
      console.log('\n--dry-run: no changes written. Re-run without --dry-run to apply.');
      return;
    }

    const update = db.prepare(
      `UPDATE messages SET run_status = 'succeeded' WHERE id = ? AND run_status = 'failed'`,
    );
    const flip = db.transaction((items: Array<{ messageId: string }>) => {
      let changed = 0;
      for (const item of items) {
        changed += update.run(item.messageId).changes;
      }
      return changed;
    });
    const changed = flip(toFlip);
    console.log(`\nRepaired ${changed} row(s): run_status failed -> succeeded.`);
  } finally {
    db.close();
  }
}

main();
