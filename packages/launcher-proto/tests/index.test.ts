import { describe, expect, it } from "vitest";

import {
  RUNTIME_APPS,
  RUNTIME_MODES,
  RUNTIME_SOURCES,
  buildAttempt,
  buildLauncherConfig,
  buildRuntimeConfig,
  createEndpoint,
  normalizeEndpoint,
  normalizeNamespace,
} from "../src/index.js";

function devRuntime() {
  return buildRuntimeConfig({
    active: {
      apps: {
        daemon: {
          endpoint: createEndpoint(17401),
          entry: {
            args: ["--serve"],
            env: { OD_PORT: "17456" },
            executable: "apps/daemon/src/sidecar/index.ts",
          },
        },
        web: {
          endpoint: "tcp://127.0.0.1:17402",
          entry: {
            env: { OD_WEB_PORT: "17573" },
            executable: "apps/web/sidecar/index.ts",
          },
        },
      },
      entry: {
        args: ["--workspace"],
        executable: "apps/desktop/dist/main/index.js",
      },
      root: "C:/repo/open-design",
      version: "dev-workspace",
    },
    generation: 1,
    lastSuccessful: {
      entry: {
        args: ["--workspace"],
        executable: "apps/desktop/dist/main/index.js",
      },
      root: "C:/repo/open-design",
      version: "dev-workspace",
    },
    mode: RUNTIME_MODES.DEV,
    namespace: "dev-local",
    namespaceRoot: ".tmp/tools-dev/dev-local",
    source: RUNTIME_SOURCES.TOOLS_DEV,
  });
}

describe("launcher proto", () => {
  it("builds launcher config", () => {
    expect(buildLauncherConfig()).toEqual({
      runtimePath: "runtime.json",
      schemaVersion: 1,
    });
    expect(buildLauncherConfig({ attemptPath: "state/attempt.json", runtimePath: "runtime.json" })).toEqual({
      attemptPath: "state/attempt.json",
      runtimePath: "runtime.json",
      schemaVersion: 1,
    });
  });

  it("builds runtime config", () => {
    const runtime = devRuntime();

    expect(runtime.schemaVersion).toBe(1);
    expect(runtime.active.version).toBe("dev-workspace");
    expect(runtime.active.apps.daemon?.endpoint).toBe("tcp://127.0.0.1:17401");
    expect(runtime.active.apps.web?.entry.env).toEqual({ OD_WEB_PORT: "17573" });
    expect(runtime.lastSuccessful.apps).toEqual({});
    expect(JSON.stringify(runtime)).toContain("\"endpoint\"");
    expect(JSON.stringify(runtime)).not.toContain("\"ipc\"");
  });

  it("normalizes endpoint", () => {
    expect(normalizeEndpoint("tcp://127.0.0.1:65535")).toBe("tcp://127.0.0.1:65535");
    expect(() => normalizeEndpoint("unix:///tmp/open-design.sock")).toThrow();
    expect(() => normalizeEndpoint("tcp://0.0.0.0:17401")).toThrow();
    expect(() => normalizeEndpoint("tcp://127.0.0.1:0")).toThrow();
    expect(() => normalizeEndpoint("tcp://127.0.0.1:017401")).toThrow();
  });

  it("matches namespace rules", () => {
    expect(normalizeNamespace("release-beta-win")).toBe("release-beta-win");
    expect(() => normalizeNamespace("")).toThrow();
    expect(() => normalizeNamespace(" beta")).toThrow();
    expect(() => normalizeNamespace("beta/local")).toThrow();
    expect(() => normalizeNamespace("-beta")).toThrow();
  });

  it("rejects unknown enums", () => {
    expect(() =>
      buildRuntimeConfig({
        ...devRuntime(),
        mode: "runtime",
      }),
    ).toThrow(/mode/);
    expect(() =>
      buildRuntimeConfig({
        ...devRuntime(),
        source: "packaged",
      }),
    ).toThrow(/source/);
    expect(() =>
      buildRuntimeConfig({
        ...devRuntime(),
        active: {
          ...devRuntime().active,
          apps: {
            api: {
              endpoint: createEndpoint(17404),
              entry: { executable: "api.js" },
            },
          },
        },
      }),
    ).toThrow(/app/);
  });

  it("builds attempt", () => {
    expect(buildAttempt(7, "0.8.1")).toEqual({
      generation: 7,
      schemaVersion: 1,
      version: "0.8.1",
    });
    expect(() => buildAttempt(-1, "0.8.1")).toThrow();
  });

  it("exports app constants", () => {
    expect(Object.values(RUNTIME_APPS)).toEqual(["daemon", "desktop", "web"]);
  });
});
