import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildTraceObjectManifests } from '../src/trace-object-manifest.js';

describe('buildTraceObjectManifests', () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), 'od-trace-objects-'));
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('splits relay uploads when combined base64 JSON would exceed the worker batch cap', async () => {
    const projectsRoot = path.join(dataDir, 'projects');
    const projectDir = path.join(projectsRoot, 'proj-1');
    await mkdir(projectDir, { recursive: true });
    await writeFile(path.join(projectDir, 'one.bin'), Buffer.alloc(900, 1));
    await writeFile(path.join(projectDir, 'two.bin'), Buffer.alloc(900, 2));

    const fetchSpy = vi.fn(async (_url: string, init: RequestInit) => {
      const body = init.body as string;
      expect(Buffer.byteLength(body, 'utf8')).toBeLessThanOrEqual(2300);
      const parsed = JSON.parse(body) as {
        objects: Array<{ storage_ref: string; content_base64: string }>;
      };
      expect(parsed.objects).toHaveLength(1);
      return new Response(
        JSON.stringify({
          objects: parsed.objects.map((object) => ({
            storage_ref: object.storage_ref,
            status: 'available',
            size_bytes: Buffer.from(object.content_base64, 'base64').byteLength,
            sha256: `sha256:${object.storage_ref.split('/').at(-1)}`,
          })),
        }),
        { status: 200 },
      );
    });

    const manifests = await buildTraceObjectManifests({
      installationId: 'install-1',
      projectId: 'proj-1',
      runId: 'run-1',
      projectsRoot,
      artifacts: [
        { slug: 'one.bin', type: 'artifact', sizeBytes: 900 },
        { slug: 'two.bin', type: 'artifact', sizeBytes: 900 },
      ],
      prompt: 'prompt',
      prefs: { metrics: true, content: true, artifactManifest: true },
      fetchImpl: fetchSpy as any,
      env: {
        OPEN_DESIGN_OBJECT_RELAY_URL: 'https://telemetry.open-design.ai/api/objects/batch',
        OPEN_DESIGN_OBJECT_MAX_BYTES: '1024',
        OPEN_DESIGN_OBJECT_BATCH_MAX_BYTES: '2300',
      },
      now: () => new Date('2026-06-08T00:00:00.000Z'),
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(manifests?.completeness).toBe('complete');
    expect(manifests?.artifactManifest).toHaveLength(2);
    expect(manifests?.artifactManifest?.map((entry) => entry.status)).toEqual(['ok', 'ok']);
    expect(manifests?.artifactManifest?.map((entry) => entry.stored_in_open_design))
      .toEqual([true, true]);
  });
});
