# WebUI 打包类型 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增一种跨平台「WebUI」打包类型——终端启动、无 Electron、可配置端口/host/token、带 start/stop/status，GUI 下双击弹终端并自动开浏览器，非 GUI 下打印访问地址。

**Architecture:** 复用 `apps/packaged` 的 headless 启动路径（`startPackagedSidecars` 拉起 daemon + web Next.js 双进程，`OD_WEB_OUTPUT_MODE=server`）。新增 `webui-launcher.ts` 入口提供 start/stop/status 子命令与配置解析；扩展 `startPackagedSidecars` 支持注入网络配置（web 的 `OD_HOST`/`OD_WEB_PORT`、daemon 的 `OD_BIND_HOST`/`OD_API_TOKEN`）。`tools/pack` 新增 `webui` 子命令，组装 node 应用 + 目标平台 `better-sqlite3` 预编译 + 启动脚本/双击包装，按平台打成 zip（mac/win）或 tar.gz（linux）。

**Tech Stack:** TypeScript（Node 24, ESM）、esbuild、vitest、cac、`@open-design/sidecar`（IPC：`createJsonIpcServer` / `requestJsonIpc`）、系统 `tar`/`zip` 与 `tools/pack/resources/win/7zip/7z.exe`。

**设计依据：** `specs/current/2026-05-30-webui-packaging-type-design.md`（§3 网络模型、§6 启动器、§7 GUI）。

---

## 文件结构

**Part 1 — 运行时启动器（apps/packaged）**

- 新建 `apps/packaged/src/webui-config.ts` — 纯函数：参数解析、配置文件加载、优先级合并、`hasDisplay()`、token 自动生成。无副作用，易单测。
- 修改 `apps/packaged/src/sidecars.ts` — 给 `PackagedDaemonSpawnEnvOptions` 与 `startPackagedSidecars` 增加可选 `network`，注入环境变量；默认行为不变。
- 新建 `apps/packaged/src/webui-launcher.ts` — start/stop/status 入口，复用 headless 启动 + IPC。
- 修改 `apps/packaged/esbuild.config.mjs` — 新增 `webui-launcher.ts` 入口。
- 修改 `apps/packaged/package.json` — `exports` 增加 `./webui-launcher`。
- 新建 `apps/packaged/tests/webui-config.test.ts`、扩展 `apps/packaged/tests/sidecars.test.ts`。

**Part 2 — 打包构建（tools/pack）**

- 新建 `tools/pack/resources/webui/` — 启动脚本与双击包装模板、`webui.config.example.json`、`README.md`。
- 修改 `tools/pack/src/resources.ts` — 暴露 webui 资源目录。
- 新建 `tools/pack/src/webui.ts` — 组装、选 better-sqlite3 预编译、写脚本、压缩。
- 修改 `tools/pack/src/config.ts` — 增加 `arch` 字段。
- 修改 `tools/pack/src/index.ts` — 注册 `webui <action>` 命令。
- 新建 `tools/pack/tests/webui.test.ts`。
- 修改 `tools/pack/AGENTS.md` — 记录 webui 子命令。

---

## Part 1 — 运行时启动器

### Task 1: webui 配置解析与 GUI 检测（纯函数）

**Files:**
- Create: `apps/packaged/src/webui-config.ts`
- Test: `apps/packaged/tests/webui-config.test.ts`

- [ ] **Step 1: 写失败测试**

Create `apps/packaged/tests/webui-config.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import {
  generateApiToken,
  hasDisplay,
  isLoopbackHost,
  parseWebuiArgs,
  resolveWebuiConfig,
} from "../src/webui-config.js";

describe("parseWebuiArgs", () => {
  it("parses command + flags", () => {
    const parsed = parseWebuiArgs([
      "start",
      "--port",
      "8080",
      "--host",
      "0.0.0.0",
      "--token",
      "abc",
      "--no-open",
      "--json",
      "--config",
      "/tmp/c.json",
    ]);
    expect(parsed.command).toBe("start");
    expect(parsed.flags).toEqual({
      port: 8080,
      host: "0.0.0.0",
      token: "abc",
      openBrowser: false,
      json: true,
      config: "/tmp/c.json",
    });
  });

  it("defaults command to start and leaves unset flags undefined", () => {
    const parsed = parseWebuiArgs([]);
    expect(parsed.command).toBe("start");
    expect(parsed.flags.port).toBeUndefined();
    expect(parsed.flags.host).toBeUndefined();
  });

  it("rejects an unknown command", () => {
    expect(() => parseWebuiArgs(["frobnicate"])).toThrow(/unknown command/i);
  });
});

describe("resolveWebuiConfig precedence", () => {
  it("flag > config file > env > default", () => {
    const resolved = resolveWebuiConfig({
      flags: { port: 8080 },
      configFile: { port: 9090, host: "0.0.0.0", token: "cfgtok" },
      env: { OD_WEB_PORT: "5000", OD_BIND_HOST: "127.0.0.1", OD_API_TOKEN: "envtok" },
    });
    // flag wins for port
    expect(resolved.port).toBe(8080);
    // config wins for host/token (no flag)
    expect(resolved.host).toBe("0.0.0.0");
    expect(resolved.token).toBe("cfgtok");
  });

  it("falls back to env then default", () => {
    const resolved = resolveWebuiConfig({
      flags: {},
      configFile: null,
      env: { OD_WEB_PORT: "5000" },
    });
    expect(resolved.port).toBe(5000);
    expect(resolved.host).toBe("127.0.0.1");
    expect(resolved.port).toBeTypeOf("number");
  });

  it("uses default port 7456 and host 127.0.0.1 when nothing set", () => {
    const resolved = resolveWebuiConfig({ flags: {}, configFile: null, env: {} });
    expect(resolved.port).toBe(7456);
    expect(resolved.host).toBe("127.0.0.1");
    expect(resolved.openBrowser).toBe(true);
  });
});

describe("isLoopbackHost", () => {
  it("treats loopback hosts as local", () => {
    expect(isLoopbackHost("127.0.0.1")).toBe(true);
    expect(isLoopbackHost("localhost")).toBe(true);
    expect(isLoopbackHost("::1")).toBe(true);
  });
  it("treats 0.0.0.0 and LAN IPs as remote", () => {
    expect(isLoopbackHost("0.0.0.0")).toBe(false);
    expect(isLoopbackHost("192.168.1.20")).toBe(false);
  });
});

describe("generateApiToken", () => {
  it("produces a prefixed base64url token", () => {
    const token = generateApiToken();
    expect(token).toMatch(/^odtoken_[A-Za-z0-9_-]{20,}$/);
    expect(generateApiToken()).not.toBe(token);
  });
});

describe("hasDisplay", () => {
  it("win32 always has display", () => {
    expect(hasDisplay("win32", {})).toBe(true);
  });
  it("darwin has display unless SSH session", () => {
    expect(hasDisplay("darwin", {})).toBe(true);
    expect(hasDisplay("darwin", { SSH_CONNECTION: "x" })).toBe(false);
  });
  it("linux needs DISPLAY or WAYLAND_DISPLAY", () => {
    expect(hasDisplay("linux", {})).toBe(false);
    expect(hasDisplay("linux", { DISPLAY: ":0" })).toBe(true);
    expect(hasDisplay("linux", { WAYLAND_DISPLAY: "wayland-0" })).toBe(true);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `pnpm --filter @open-design/packaged test -- tests/webui-config.test.ts`
Expected: FAIL — `Cannot find module '../src/webui-config.js'`.

- [ ] **Step 3: 写实现**

Create `apps/packaged/src/webui-config.ts`:

```typescript
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

export type WebuiCommand = "start" | "stop" | "status";

export type WebuiFlags = {
  port?: number;
  host?: string;
  token?: string;
  openBrowser?: boolean;
  json?: boolean;
  config?: string;
};

export type WebuiConfigFile = {
  port?: number;
  host?: string;
  token?: string;
  openBrowser?: boolean;
  namespace?: string;
  dataDir?: string | null;
};

export type ResolvedWebuiConfig = {
  port: number;
  host: string;
  token: string | null;
  openBrowser: boolean;
  namespace: string | null;
  dataDir: string | null;
};

const DEFAULT_PORT = 7456;
const DEFAULT_HOST = "127.0.0.1";
const COMMANDS = new Set<WebuiCommand>(["start", "stop", "status"]);

export function parseWebuiArgs(argv: string[]): { command: WebuiCommand; flags: WebuiFlags } {
  const flags: WebuiFlags = {};
  let command: WebuiCommand = "start";
  let i = 0;

  if (argv.length > 0 && !argv[0].startsWith("-")) {
    const candidate = argv[0];
    if (!COMMANDS.has(candidate as WebuiCommand)) {
      throw new Error(`unknown command: ${candidate} (expected start|stop|status)`);
    }
    command = candidate as WebuiCommand;
    i = 1;
  }

  for (; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--port":
        flags.port = Number(argv[++i]);
        if (!Number.isInteger(flags.port)) throw new Error("--port must be an integer");
        break;
      case "--host":
        flags.host = argv[++i];
        break;
      case "--token":
        flags.token = argv[++i];
        break;
      case "--config":
        flags.config = argv[++i];
        break;
      case "--no-open":
        flags.openBrowser = false;
        break;
      case "--json":
        flags.json = true;
        break;
      default:
        throw new Error(`unknown argument: ${arg}`);
    }
  }
  return { command, flags };
}

export function loadConfigFile(path: string): WebuiConfigFile | null {
  try {
    const raw = readFileSync(path, "utf8");
    return JSON.parse(raw) as WebuiConfigFile;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new Error(`failed to read config file ${path}: ${(error as Error).message}`);
  }
}

export function resolveWebuiConfig(input: {
  flags: WebuiFlags;
  configFile: WebuiConfigFile | null;
  env: NodeJS.ProcessEnv;
}): ResolvedWebuiConfig {
  const { flags, configFile, env } = input;
  const cfg = configFile ?? {};

  const envPort = env.OD_WEB_PORT != null ? Number(env.OD_WEB_PORT) : undefined;
  const port =
    flags.port ?? cfg.port ?? (Number.isInteger(envPort) ? (envPort as number) : undefined) ?? DEFAULT_PORT;

  const host = flags.host ?? cfg.host ?? env.OD_BIND_HOST ?? DEFAULT_HOST;
  const token = flags.token ?? cfg.token ?? env.OD_API_TOKEN ?? null;
  const openBrowser = flags.openBrowser ?? cfg.openBrowser ?? true;
  const namespace = cfg.namespace ?? env.OD_PACKAGED_NAMESPACE ?? null;
  const dataDir = cfg.dataDir ?? env.OD_DATA_DIR ?? null;

  return { port, host, token, openBrowser, namespace, dataDir };
}

export function isLoopbackHost(host: string): boolean {
  const normalized = host.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (normalized === "localhost") return true;
  if (normalized === "::1" || normalized === "0:0:0:0:0:0:0:1") return true;
  return normalized === "127.0.0.1" || normalized.startsWith("127.");
}

export function generateApiToken(): string {
  return `odtoken_${randomBytes(32).toString("base64url")}`;
}

export function hasDisplay(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): boolean {
  if (platform === "win32") return true;
  if (platform === "darwin") return env.SSH_CONNECTION == null;
  return Boolean(env.DISPLAY || env.WAYLAND_DISPLAY);
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `pnpm --filter @open-design/packaged test -- tests/webui-config.test.ts`
Expected: PASS（全部用例）。

- [ ] **Step 5: typecheck**

Run: `pnpm --filter @open-design/packaged typecheck`
Expected: 通过，无类型错误。

- [ ] **Step 6: 提交**

```bash
git add apps/packaged/src/webui-config.ts apps/packaged/tests/webui-config.test.ts
git commit -m "feat(packaged): webui 配置解析与 GUI 检测纯函数"
```

---

### Task 2: 扩展 startPackagedSidecars 注入网络配置

**Files:**
- Modify: `apps/packaged/src/sidecars.ts`（`PackagedDaemonSpawnEnvOptions` 约 279-297；`buildPackagedDaemonSpawnEnv` 约 305-351；`startPackagedSidecars` options 约 430-452 与 web env 约 501-507）
- Test: `apps/packaged/tests/sidecars.test.ts`（追加用例）

- [ ] **Step 1: 写失败测试**

在 `apps/packaged/tests/sidecars.test.ts` 末尾追加（沿用文件已有的 `buildPackagedDaemonSpawnEnv` 导入与 `makePaths()` 风格；若文件未导入则补 `import { buildPackagedDaemonSpawnEnv } from "../src/sidecars.js";`）：

```typescript
describe("buildPackagedDaemonSpawnEnv network injection", () => {
  const paths = {
    dataRoot: "/tmp/ns/data",
    resourceRoot: "/tmp/ns/res",
    installationRoot: "/tmp/ns/install",
  } as unknown as import("../src/paths.js").PackagedNamespacePaths;

  it("keeps dynamic daemon port and no token by default (no network)", () => {
    const env = buildPackagedDaemonSpawnEnv(paths, {
      appVersion: null,
      daemonCliEntry: null,
      requireDesktopAuth: false,
    });
    expect(env.OD_PORT).toBe("0");
    expect(env.OD_BIND_HOST).toBeUndefined();
    expect(env.OD_API_TOKEN).toBeUndefined();
  });

  it("injects bind host and token when network is provided", () => {
    const env = buildPackagedDaemonSpawnEnv(paths, {
      appVersion: null,
      daemonCliEntry: null,
      requireDesktopAuth: false,
      network: { bindHost: "0.0.0.0", apiToken: "odtoken_xyz", daemonPort: null },
    });
    expect(env.OD_BIND_HOST).toBe("0.0.0.0");
    expect(env.OD_API_TOKEN).toBe("odtoken_xyz");
    // daemonPort null -> remains dynamic "0"
    expect(env.OD_PORT).toBe("0");
  });

  it("honors an explicit daemon port", () => {
    const env = buildPackagedDaemonSpawnEnv(paths, {
      appVersion: null,
      daemonCliEntry: null,
      requireDesktopAuth: false,
      network: { daemonPort: 7777, bindHost: null, apiToken: null },
    });
    expect(env.OD_PORT).toBe("7777");
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `pnpm --filter @open-design/packaged test -- tests/sidecars.test.ts`
Expected: FAIL — `network` 不是合法属性（类型错误）或注入断言失败。

- [ ] **Step 3: 写实现**

3a. 在 `apps/packaged/src/sidecars.ts` 定义网络选项类型（放在 `PackagedDaemonSpawnEnvOptions` 之前）：

```typescript
export type PackagedNetworkOptions = {
  /** web 浏览器访问端口；映射到 web 子进程的 OD_WEB_PORT/PORT。 */
  webPort?: number | null;
  /** web 监听 host；映射到 web 子进程的 OD_HOST。 */
  webHost?: string | null;
  /** daemon 监听端口；映射到 daemon 的 OD_PORT，默认 0（动态）。 */
  daemonPort?: number | null;
  /** daemon 绑定 host；映射到 OD_BIND_HOST。 */
  bindHost?: string | null;
  /** daemon API token；映射到 OD_API_TOKEN。 */
  apiToken?: string | null;
};
```

3b. 给 `PackagedDaemonSpawnEnvOptions`（约 279-297）追加可选字段：

```typescript
  posthogHost?: string | null;
  /** webui 网络注入；省略时保持动态端口 + 环回 + 无 token。 */
  network?: PackagedNetworkOptions | null;
};
```

3c. 修改 `buildPackagedDaemonSpawnEnv` 返回对象：把硬编码的 `[SIDECAR_ENV.DAEMON_PORT]: "0"`（约 310 行）替换为下面，并在对象末尾（`posthogHost` 注入之后、return 闭合的 `}` 之前）追加 host/token 注入：

```typescript
    [SIDECAR_ENV.DAEMON_PORT]: String(options.network?.daemonPort ?? 0),
```

末尾追加：

```typescript
    ...(options.network?.bindHost == null || options.network.bindHost.length === 0
      ? {}
      : { OD_BIND_HOST: options.network.bindHost }),
    ...(options.network?.apiToken == null || options.network.apiToken.length === 0
      ? {}
      : { OD_API_TOKEN: options.network.apiToken }),
```

3d. 给 `startPackagedSidecars` 的 options（约 430-452）追加：

```typescript
    webOutputMode: PackagedWebOutputMode;
    network?: PackagedNetworkOptions | null;
  },
```

3e. 把 `options.network` 透传给 daemon env（约 470-479 的 `buildPackagedDaemonSpawnEnv(paths, { ... })` 内追加一行）：

```typescript
        posthogHost: options.posthogHost,
        network: options.network ?? null,
      }),
```

3f. 修改 web 子进程 env（约 501-507），注入 `OD_HOST` 并用 network 的 web 端口（保留 daemon 实际端口 `extractPort(daemonStatus.url)` 不变）：

```typescript
      env: {
        [SIDECAR_ENV.DAEMON_PORT]: extractPort(daemonStatus.url),
        [SIDECAR_ENV.WEB_PORT]: String(options.network?.webPort ?? 0),
        ...(options.webStandaloneRoot == null ? {} : { OD_WEB_STANDALONE_ROOT: options.webStandaloneRoot }),
        ...(options.network?.webHost == null || options.network.webHost.length === 0
          ? {}
          : { OD_HOST: options.network.webHost }),
        OD_WEB_OUTPUT_MODE: options.webOutputMode,
        PORT: String(options.network?.webPort ?? 0),
      },
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `pnpm --filter @open-design/packaged test -- tests/sidecars.test.ts`
Expected: PASS（新用例 + 原有用例）。

- [ ] **Step 5: typecheck**

Run: `pnpm --filter @open-design/packaged typecheck`
Expected: 通过。

- [ ] **Step 6: 提交**

```bash
git add apps/packaged/src/sidecars.ts apps/packaged/tests/sidecars.test.ts
git commit -m "feat(packaged): startPackagedSidecars 支持注入网络配置"
```

---

### Task 3: webui-launcher 入口（start/stop/status）

**Files:**
- Create: `apps/packaged/src/webui-launcher.ts`
- Modify: `apps/packaged/esbuild.config.mjs`
- Modify: `apps/packaged/package.json`（`exports`）

> 说明：本入口主体是进程编排，难以纯单测；可测逻辑已抽到 Task 1 的 `webui-config.ts`。验证靠 typecheck + 构建 + Part 2 的端到端冒烟（Task 7）。

- [ ] **Step 1: 写入口实现**

Create `apps/packaged/src/webui-launcher.ts`（以 `headless.ts` 为蓝本，复用其 namespace/paths/stamp/identity/IPC 逻辑；下面给出完整文件）：

```typescript
import { mkdir, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  APP_KEYS,
  OPEN_DESIGN_SIDECAR_CONTRACT,
  SIDECAR_DEFAULTS,
  SIDECAR_MESSAGES,
  SIDECAR_MODES,
  SIDECAR_SOURCES,
  normalizeDesktopSidecarMessage,
  type SidecarStamp,
} from "@open-design/sidecar-proto";
import {
  bootstrapSidecarRuntime,
  createJsonIpcServer,
  requestJsonIpc,
  resolveAppIpcPath,
} from "@open-design/sidecar";
import { openBrowser } from "@open-design/daemon/browser-open";

import { PACKAGED_NAMESPACE_ENV, type PackagedConfig } from "./config.js";
import { writePackagedDesktopIdentity, writePackagedWebIdentity } from "./identity.js";
import { resolvePackagedNamespacePaths } from "./paths.js";
import { startPackagedSidecars } from "./sidecars.js";
import {
  generateApiToken,
  hasDisplay,
  isLoopbackHost,
  loadConfigFile,
  parseWebuiArgs,
  resolveWebuiConfig,
  type ResolvedWebuiConfig,
} from "./webui-config.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

function resolveNamespaceBaseRoot(): string {
  const odDataDir = process.env.OD_DATA_DIR;
  if (odDataDir != null && odDataDir.length > 0) {
    return join(resolve(odDataDir.replace(/^~/, homedir())), "namespaces");
  }
  const xdgDataHome = process.env.XDG_DATA_HOME;
  const dataBase =
    xdgDataHome != null && xdgDataHome.length > 0 ? xdgDataHome : join(homedir(), ".local", "share");
  return join(dataBase, "open-design", "namespaces");
}

function resolveLauncherConfig(namespace: string): PackagedConfig {
  const resourceRoot =
    process.env.OD_RESOURCE_ROOT ?? join(__dirname, "..", "..", "..", "open-design");
  return {
    amrProfile: null,
    appVersion: null,
    daemonCliEntry: null,
    daemonSidecarEntry: null,
    namespace,
    namespaceBaseRoot: resolveNamespaceBaseRoot(),
    nodeCommand: null,
    resourceRoot,
    telemetryRelayUrl: process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL?.trim() || null,
    posthogKey: process.env.POSTHOG_KEY?.trim() || null,
    posthogHost: process.env.POSTHOG_HOST?.trim() || null,
    webSidecarEntry: null,
    webStandaloneRoot: null,
    // 与现有 Linux headless 一致的、已验证可在打包后运行的 web 运行模式。
    webOutputMode: "server",
  };
}

function createStamp(namespace: string): SidecarStamp {
  return {
    app: APP_KEYS.DESKTOP,
    ipc: resolveAppIpcPath({ app: APP_KEYS.DESKTOP, contract: OPEN_DESIGN_SIDECAR_CONTRACT, namespace }),
    mode: SIDECAR_MODES.RUNTIME,
    namespace,
    source: SIDECAR_SOURCES.PACKAGED,
  };
}

function colorize(text: string): string {
  if (process.stdout.isTTY !== true || process.env.NO_COLOR != null) return text;
  return `\x1b[36m\x1b[4m${text}\x1b[0m`;
}

function discoverConfigFile(explicitPath?: string) {
  if (explicitPath != null) return loadConfigFile(explicitPath);
  // 自动发现：启动器同级 / 安装根目录的 webui.config.json
  const candidates = [
    join(process.cwd(), "webui.config.json"),
    join(__dirname, "..", "..", "..", "..", "webui.config.json"),
  ];
  for (const candidate of candidates) {
    const cfg = loadConfigFile(candidate);
    if (cfg != null) return cfg;
  }
  return null;
}

function browserUrl(config: ResolvedWebuiConfig): string {
  const host = isLoopbackHost(config.host) ? "localhost" : config.host;
  return `http://${host}:${config.port}`;
}

async function commandStart(config: ResolvedWebuiConfig, json: boolean): Promise<void> {
  const namespace = OPEN_DESIGN_SIDECAR_CONTRACT.normalizeNamespace(
    config.namespace ?? process.env[PACKAGED_NAMESPACE_ENV] ?? SIDECAR_DEFAULTS.namespace,
  );
  if (config.dataDir != null) process.env.OD_DATA_DIR = config.dataDir;

  // 远程访问无 token -> 自动生成
  let token = config.token;
  if (!isLoopbackHost(config.host) && (token == null || token.length === 0)) {
    token = generateApiToken();
    process.stdout.write(`\n  未为远程访问设置 token，已自动生成：\n    token: ${token}\n`);
  }

  const packagedConfig = resolveLauncherConfig(namespace);
  const paths = resolvePackagedNamespacePaths(packagedConfig);
  const stamp = createStamp(namespace);
  await mkdir(paths.runtimeRoot, { recursive: true });

  const runtime = bootstrapSidecarRuntime(stamp, process.env, {
    app: APP_KEYS.DESKTOP,
    base: paths.runtimeRoot,
    contract: OPEN_DESIGN_SIDECAR_CONTRACT,
  });

  const identity = await writePackagedDesktopIdentity({
    identityPath: paths.headlessIdentityPath,
    paths,
    stamp,
  });

  const sidecars = await startPackagedSidecars(runtime, paths, {
    appVersion: packagedConfig.appVersion,
    amrProfile: packagedConfig.amrProfile,
    daemonCliEntry: packagedConfig.daemonCliEntry,
    daemonSidecarEntry: packagedConfig.daemonSidecarEntry,
    nodeCommand: packagedConfig.nodeCommand,
    telemetryRelayUrl: packagedConfig.telemetryRelayUrl,
    posthogKey: packagedConfig.posthogKey,
    posthogHost: packagedConfig.posthogHost,
    requireDesktopAuth: false,
    webSidecarEntry: packagedConfig.webSidecarEntry,
    webStandaloneRoot: packagedConfig.webStandaloneRoot,
    webOutputMode: packagedConfig.webOutputMode,
    network: {
      webHost: config.host,
      webPort: config.port,
      daemonPort: null,
      bindHost: config.host,
      apiToken: token,
    },
  });

  const webUrl = sidecars.web.url;
  if (!webUrl) {
    await sidecars.close().catch(() => undefined);
    await identity.close().catch(() => undefined);
    throw new Error("web sidecar failed to produce URL — check logs/desktop/latest.log");
  }
  const displayUrl = browserUrl(config);

  const shutdown = async (): Promise<void> => {
    process.stdout.write("\n Shutting down Open Design...\n");
    await ipcServer.close().catch(() => undefined);
    await sidecars.close().catch(() => undefined);
    await identity.close().catch(() => undefined);
    process.exit(0);
  };

  const ipcServer = await createJsonIpcServer({
    socketPath: stamp.ipc,
    handler: async (message: unknown) => {
      const request = normalizeDesktopSidecarMessage(message);
      switch (request.type) {
        case SIDECAR_MESSAGES.STATUS:
          return { pid: process.pid, state: "running", url: displayUrl, updatedAt: new Date().toISOString() };
        case SIDECAR_MESSAGES.SHUTDOWN:
          setImmediate(() => {
            void shutdown().finally(() => process.exit(0));
          });
          return { accepted: true };
      }
    },
  });

  await writePackagedWebIdentity({ paths, pid: process.pid, url: displayUrl });

  if (json) {
    process.stdout.write(`${JSON.stringify({ pid: process.pid, url: displayUrl, token })}\n`);
  } else {
    process.stdout.write(`\n Open Design is running\n\n`);
    process.stdout.write(` ➜ ${colorize(token ? `${displayUrl}/?token=${token}` : displayUrl)}\n\n`);
    process.stdout.write(` Press Ctrl+C to stop\n\n`);
  }

  if (config.openBrowser && hasDisplay(process.platform, process.env)) {
    openBrowser(displayUrl);
  }

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

async function commandStopOrStatus(command: "stop" | "status", json: boolean): Promise<void> {
  const namespace = OPEN_DESIGN_SIDECAR_CONTRACT.normalizeNamespace(
    process.env[PACKAGED_NAMESPACE_ENV] ?? SIDECAR_DEFAULTS.namespace,
  );
  const ipc = resolveAppIpcPath({ app: APP_KEYS.DESKTOP, contract: OPEN_DESIGN_SIDECAR_CONTRACT, namespace });
  const type = command === "stop" ? SIDECAR_MESSAGES.SHUTDOWN : SIDECAR_MESSAGES.STATUS;
  try {
    const reply = await requestJsonIpc(ipc, { type }, { timeoutMs: 2000 });
    if (json) process.stdout.write(`${JSON.stringify(reply)}\n`);
    else if (command === "status") process.stdout.write(` ${JSON.stringify(reply)}\n`);
    else process.stdout.write(` Open Design 已停止\n`);
  } catch {
    if (json) process.stdout.write(`${JSON.stringify({ state: "stopped" })}\n`);
    else process.stdout.write(` 未发现运行中的 Open Design（namespace=${namespace}）\n`);
    if (command === "status") process.exitCode = 1;
  }
}

async function main(): Promise<void> {
  const { command, flags } = parseWebuiArgs(process.argv.slice(2));
  if (command === "start") {
    const configFile = discoverConfigFile(flags.config);
    const config = resolveWebuiConfig({ flags, configFile, env: process.env });
    await commandStart(config, flags.json === true);
    return;
  }
  await commandStopOrStatus(command, flags.json === true);
}

void main().catch((error: unknown) => {
  process.stderr.write(`open-design webui failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
```

> 注：`@open-design/daemon/browser-open` 导入路径需与 daemon 包的 `exports` 一致。若 daemon 未导出该子路径，改为在 Task 3 附加步骤中给 `apps/daemon/package.json` 增加 `"./browser-open": { "default": "./dist/browser-open.js" }`，并确认 `apps/daemon` 已构建。先用下一步的 typecheck 验证。

- [ ] **Step 2: 加 esbuild 入口**

Modify `apps/packaged/esbuild.config.mjs`，在末尾追加第三个 build：

```javascript
await build({
  ...sharedOptions,
  entryPoints: ["./src/webui-launcher.ts"],
  outfile: "./dist/webui-launcher.mjs",
});
```

- [ ] **Step 3: 加 package.json 导出**

Modify `apps/packaged/package.json` 的 `exports`，在 `"./headless"` 之后追加：

```json
    "./webui-launcher": {
      "default": "./dist/webui-launcher.mjs"
    },
```

- [ ] **Step 4: 确认 daemon 导出 browser-open（按需）**

Run: `node -e "console.log(require('./apps/daemon/package.json').exports)"`
若无 `./browser-open`，Modify `apps/daemon/package.json` 的 `exports` 追加：

```json
    "./browser-open": {
      "types": "./dist/browser-open.d.ts",
      "default": "./dist/browser-open.js"
    },
```

然后 Run: `pnpm --filter @open-design/daemon build`

- [ ] **Step 5: typecheck + 构建**

Run:
```bash
pnpm --filter @open-design/packaged typecheck
pnpm --filter @open-design/packaged build
```
Expected: 通过；`apps/packaged/dist/webui-launcher.mjs` 生成。

- [ ] **Step 6: 提交**

```bash
git add apps/packaged/src/webui-launcher.ts apps/packaged/esbuild.config.mjs apps/packaged/package.json apps/daemon/package.json
git commit -m "feat(packaged): webui-launcher start/stop/status 入口"
```

---

## Part 2 — 打包构建（tools/pack）

### Task 4: webui 资源模板与脚本

**Files:**
- Create: `tools/pack/resources/webui/open-design.sh`（mac/linux 外壳）
- Create: `tools/pack/resources/webui/open-design.cmd`（win 外壳）
- Create: `tools/pack/resources/webui/launch-mac.command`
- Create: `tools/pack/resources/webui/launch-win.bat`
- Create: `tools/pack/resources/webui/open-design-webui.desktop`
- Create: `tools/pack/resources/webui/webui.config.example.json`
- Create: `tools/pack/resources/webui/README.md`
- Modify: `tools/pack/src/resources.ts`

> 这些是静态模板，组装时复制到产物。脚本里相对路径以「产物根目录」为基准：外壳脚本与 `app/` 同级，启动器入口在 `app/node_modules/@open-design/packaged/dist/webui-launcher.mjs`。

- [ ] **Step 1: 写 mac/linux 外壳 `open-design.sh`**

```bash
#!/usr/bin/env sh
# Open Design WebUI 启动器外壳。校验 Node 24 后转发到 webui-launcher。
set -e
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ENTRY="$SCRIPT_DIR/app/node_modules/@open-design/packaged/dist/webui-launcher.mjs"

if ! command -v node >/dev/null 2>&1; then
  echo "未找到 Node.js。请安装 Node 24 后重试：https://nodejs.org" >&2
  exit 1
fi
MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$MAJOR" -lt 24 ]; then
  echo "需要 Node 24+，当前为 $(node --version)。请升级后重试。" >&2
  exit 1
fi
export OD_RESOURCE_ROOT="$SCRIPT_DIR/app/resources/open-design"
exec node "$ENTRY" "$@"
```

- [ ] **Step 2: 写 win 外壳 `open-design.cmd`**

```bat
@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
set "ENTRY=%SCRIPT_DIR%app\node_modules\@open-design\packaged\dist\webui-launcher.mjs"
where node >nul 2>nul
if errorlevel 1 (
  echo 未找到 Node.js。请安装 Node 24 后重试： https://nodejs.org 1>&2
  exit /b 1
)
for /f "tokens=1 delims=." %%v in ('node -p "process.versions.node"') do set "MAJOR=%%v"
if %MAJOR% LSS 24 (
  echo 需要 Node 24+，请升级后重试。 1>&2
  exit /b 1
)
set "OD_RESOURCE_ROOT=%SCRIPT_DIR%app\resources\open-design"
node "%ENTRY%" %*
endlocal
```

- [ ] **Step 3: 写双击包装**

`launch-mac.command`（双击在 Terminal 运行 start）：

```bash
#!/usr/bin/env sh
DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec "$DIR/open-design.sh" start
```

`launch-win.bat`：

```bat
@echo off
cd /d "%~dp0"
call open-design.cmd start
pause
```

`open-design-webui.desktop`：

```ini
[Desktop Entry]
Type=Application
Name=Open Design WebUI
Comment=Start Open Design WebUI in a terminal
Exec=sh -c 'cd "$(dirname "%k")" && ./open-design.sh start; exec $SHELL'
Terminal=true
Categories=Development;
```

- [ ] **Step 4: 写配置示例与 README**

`webui.config.example.json`：

```json
{
  "port": 7456,
  "host": "127.0.0.1",
  "token": null,
  "openBrowser": true
}
```

`README.md`：

```markdown
# Open Design WebUI

跨平台、终端启动的 Open Design Web 运行时（无 Electron）。

## 前置条件
- 已安装 Node.js 24+（`node --version`）。

## 启动 / 停止
- mac/Linux：`./open-design.sh start`，停止 `./open-design.sh stop`
- Windows：`open-design.cmd start`，停止 `open-design.cmd stop`
- 双击：mac `Open Design WebUI.command`、Windows `Open Design WebUI.bat`、Linux `open-design-webui.desktop`

启动后终端打印访问地址；检测到图形界面时自动打开浏览器。无图形界面（服务器）仅打印地址。

## 配置（优先级：命令行 > webui.config.json > 环境变量 > 默认）
- `--port <N>`（默认 7456）：浏览器访问端口
- `--host <ADDR>`（默认 127.0.0.1；填 `0.0.0.0` 开启远程访问）
- `--token <T>`：保护 daemon `/api`（程序化客户端用 `Authorization: Bearer <T>`）
- `--no-open`：不自动打开浏览器
- `--config <PATH>`：指定配置文件

把上述键写入与本脚本同级的 `webui.config.json` 即可持久化。

## 安全提示
开启远程访问（`host=0.0.0.0`）时，token 仅保护直连 daemon API 的程序化客户端；**Web UI 自身不做应用层鉴权**。如需保护远程 Web UI，请在前面架设反向代理（nginx/caddy basic-auth）或使用 VPN / 网络隔离。
```

- [ ] **Step 5: 暴露资源目录**

Modify `tools/pack/src/resources.ts`，在 `resourcesRoot` 定义后追加导出：

```typescript
export const webuiResourcesRoot = join(resourcesRoot, "webui");
```

- [ ] **Step 6: 提交**

```bash
chmod +x tools/pack/resources/webui/open-design.sh tools/pack/resources/webui/launch-mac.command
git add tools/pack/resources/webui tools/pack/src/resources.ts
git commit -m "feat(tools-pack): webui 启动脚本与资源模板"
```

---

### Task 5: webui 组装与压缩

**Files:**
- Create: `tools/pack/src/webui.ts`
- Modify: `tools/pack/src/config.ts`（增加 `arch`）
- Test: `tools/pack/tests/webui.test.ts`

- [ ] **Step 1: 先加 arch 字段并写纯函数测试**

Modify `tools/pack/src/config.ts`：在 `ToolPackConfig` 增加 `arch: ToolPackArch;`，并定义与解析：

```typescript
export type ToolPackArch = "x64" | "arm64";

export function resolveToolPackArch(value: unknown): ToolPackArch {
  const v = typeof value === "string" && value.length > 0 ? value : process.arch;
  if (v === "x64" || v === "arm64") return v;
  throw new Error(`unsupported arch: ${String(v)} (expected x64 or arm64)`);
}
```

在 `resolveToolPackConfig` 返回对象里加 `arch: resolveToolPackArch((options as { arch?: string }).arch)`，并在 `ToolPackCliOptions` 类型中加可选 `arch?: string`。

Create `tools/pack/tests/webui.test.ts`：

```typescript
import { describe, expect, it } from "vitest";

import {
  prebuiltSqliteTarget,
  webuiArchiveName,
  webuiArchiveKind,
} from "../src/webui.js";

describe("webuiArchiveName", () => {
  it("names per platform/arch/version", () => {
    expect(webuiArchiveName({ platform: "mac", arch: "arm64", version: "0.8.1" }))
      .toBe("open-design-webui-0.8.1-mac-arm64.zip");
    expect(webuiArchiveName({ platform: "linux", arch: "x64", version: "0.8.1" }))
      .toBe("open-design-webui-0.8.1-linux-x64.tar.gz");
    expect(webuiArchiveName({ platform: "win", arch: "x64", version: "0.8.1" }))
      .toBe("open-design-webui-0.8.1-win-x64.zip");
  });
});

describe("webuiArchiveKind", () => {
  it("linux -> tar.gz, mac/win -> zip", () => {
    expect(webuiArchiveKind("linux")).toBe("tar.gz");
    expect(webuiArchiveKind("mac")).toBe("zip");
    expect(webuiArchiveKind("win")).toBe("zip");
  });
});

describe("prebuiltSqliteTarget", () => {
  it("maps tools-pack platform/arch to prebuild-install napi target", () => {
    expect(prebuiltSqliteTarget("mac", "arm64")).toEqual({ platform: "darwin", arch: "arm64" });
    expect(prebuiltSqliteTarget("win", "x64")).toEqual({ platform: "win32", arch: "x64" });
    expect(prebuiltSqliteTarget("linux", "x64")).toEqual({ platform: "linux", arch: "x64" });
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `pnpm --filter @open-design/tools-pack test -- tests/webui.test.ts`
Expected: FAIL — `../src/webui.js` 不存在。

- [ ] **Step 3: 写实现的纯函数部分**

Create `tools/pack/src/webui.ts`（先放纯函数，组装函数在下一步补全）：

```typescript
import { execFile } from "node:child_process";
import { cp, mkdir, rm, stat, writeFile, chmod } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import type { ToolPackArch, ToolPackConfig, ToolPackPlatform } from "./config.js";
import { webuiResourcesRoot } from "./resources.js";

const execFileAsync = promisify(execFile);

export type WebuiArchiveKind = "zip" | "tar.gz";

export function webuiArchiveKind(platform: ToolPackPlatform): WebuiArchiveKind {
  return platform === "linux" ? "tar.gz" : "zip";
}

export function webuiArchiveName(input: {
  platform: ToolPackPlatform;
  arch: ToolPackArch;
  version: string;
}): string {
  const ext = webuiArchiveKind(input.platform);
  return `open-design-webui-${input.version}-${input.platform}-${input.arch}.${ext}`;
}

export function prebuiltSqliteTarget(
  platform: ToolPackPlatform,
  arch: ToolPackArch,
): { platform: "darwin" | "linux" | "win32"; arch: ToolPackArch } {
  const map = { mac: "darwin", linux: "linux", win: "win32" } as const;
  return { platform: map[platform], arch };
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `pnpm --filter @open-design/tools-pack test -- tests/webui.test.ts`
Expected: PASS。

- [ ] **Step 5: 补全组装与压缩函数**

在 `tools/pack/src/webui.ts` 追加（依赖 Part 1 的产物与现有 workspace build / 组装约定；复用 `linux.ts` 的 `writeAssembledApp` 思路，但写成 webui 专用的内联实现以保持单一职责）：

```typescript
export type WebuiBuildResult = {
  platform: ToolPackPlatform;
  arch: ToolPackArch;
  archivePath: string;
  stageRoot: string;
};

/**
 * 把目标平台的 better-sqlite3 预编译二进制装入已 install 的 node_modules。
 * 要求受支持的 os/arch 在 npm 上有 prebuild；失败即报错（不静默跳过）。
 */
export async function installPrebuiltSqlite(
  appRoot: string,
  platform: ToolPackPlatform,
  arch: ToolPackArch,
): Promise<void> {
  const target = prebuiltSqliteTarget(platform, arch);
  const sqliteDir = join(appRoot, "node_modules", "better-sqlite3");
  const prebuildInstall = join(sqliteDir, "node_modules", ".bin", "prebuild-install");
  try {
    await execFileAsync(
      process.execPath,
      [prebuildInstall, "--platform", target.platform, "--arch", target.arch, "--napi"],
      { cwd: sqliteDir },
    );
  } catch (error) {
    throw new Error(
      `failed to fetch better-sqlite3 prebuild for ${target.platform}/${target.arch}: ` +
        `${(error as Error).message}. 该 os/arch 可能无预编译包。`,
    );
  }
}

export async function createWebuiArchive(
  stageRoot: string,
  archivePath: string,
  kind: WebuiArchiveKind,
  sevenZipExe: string | null,
): Promise<void> {
  await mkdir(dirname(archivePath), { recursive: true });
  await rm(archivePath, { force: true });
  if (kind === "tar.gz") {
    await execFileAsync("tar", ["-czf", archivePath, "-C", stageRoot, "."]);
  } else if (sevenZipExe != null) {
    await execFileAsync(sevenZipExe, ["a", "-tzip", "-mx=5", archivePath, "./*"], { cwd: stageRoot });
  } else {
    // mac：用系统 zip
    await execFileAsync("zip", ["-r", "-q", archivePath, "."], { cwd: stageRoot });
  }
  await stat(archivePath);
}
```

- [ ] **Step 6: 提取共享组装原语（前置重构）**

`buildPackedWebui` 复用 `linux.ts` 的组装逻辑，但这些原语当前是 `linux.ts` 私有且耦合 `LinuxPaths`：`INTERNAL_PACKAGES`、`PackedTarballInfo`、`collectWorkspaceTarballs`（`linux.ts:428-447`）、`readPackagedVersion`（`384`）、`copyResourceTree`（`449`，含 `bin/node` 复制）、`writeAssembledApp`（`468-525`，写 Electron `preload.cjs`/`main.cjs` + `package.json` + production install）。

新建 `tools/pack/src/assemble.ts`，把上述原语移入并改为收**原始路径参数**而非 `LinuxPaths`，目标签名：

```typescript
export type PackedTarballInfo = { fileName: string; packageName: string };
export const INTERNAL_PACKAGES: ReadonlyArray<{ directory: string; name: string }>; // 从 linux.ts 原样迁移

export async function collectWorkspaceTarballs(config: ToolPackConfig, tarballsRoot: string): Promise<PackedTarballInfo[]>;
export async function readPackagedVersion(config: ToolPackConfig): Promise<string>;
export async function copyResourceTree(config: ToolPackConfig, resourceRoot: string): Promise<void>;

/** assembleNodeApp：组装可被 node 直接运行的应用目录（不含 Electron preload/main）。 */
export async function assembleNodeApp(input: {
  config: ToolPackConfig;
  appRoot: string;
  tarballsRoot: string;
  packed: PackedTarballInfo[];
}): Promise<void>; // 写 package.json(file: deps) + main.cjs stub + runProductionInstall(appRoot)
```

`linux.ts` 改为从 `assemble.ts` import 这些符号（删除其本地定义，`writeAssembledApp` 内部改调 `assembleNodeApp` 并自行补写 `preload.cjs`/Electron `open-design-config.json`，保持 linux 行为不变）。

运行 linux 组装回归：`pnpm --filter @open-design/tools-pack test`，确认现有 linux 用例仍绿（diff against baseline：先 `git stash` 看 main 是否本就有失败）。

- [ ] **Step 7: 实现 buildPackedWebui**

在 `tools/pack/src/webui.ts` 追加（调用 Step 6 提取的原语）：

```typescript
import {
  assembleNodeApp,
  collectWorkspaceTarballs,
  copyResourceTree,
  readPackagedVersion,
} from "./assemble.js";
import { webuiResourcesRoot } from "./resources.js";
import { winResources } from "./resources.js"; // 复用 7z

export async function buildPackedWebui(config: ToolPackConfig): Promise<WebuiBuildResult> {
  const platform = config.platform;
  const arch = config.arch;
  const version = await readPackagedVersion(config);

  // 1) 确保 workspace 构建产物（web + daemon dist + packaged dist）就绪。
  //    复用 packLinux 的 ensureWorkspaceBuildArtifacts 调用形态（见 linux.ts:616 起的 packLinux）。
  //    webui 固定 server 模式（config.webOutputMode 已在 Task 6 命令层覆盖为 "server"）。

  const stageRoot = join(config.roots.output.namespaceRoot, "webui", `${platform}-${arch}`, "stage");
  const appRoot = join(stageRoot, "app");
  const resourceRoot = join(appRoot, "resources", "open-design");
  await rm(stageRoot, { force: true, recursive: true });
  await mkdir(appRoot, { recursive: true });

  // 2) 组装 node 应用 + production install。
  const tarballsRoot = join(config.roots.output.namespaceRoot, "webui", `${platform}-${arch}`, "tarballs");
  const packed = await collectWorkspaceTarballs(config, tarballsRoot);
  await assembleNodeApp({ config, appRoot, tarballsRoot, packed });

  // 3) 资源树 + bundled node（webui 要求系统 node，所以不复制 bin/node；只复制 skills 等资源）。
  await copyResourceTree(config, resourceRoot);

  // 4) 目标平台 better-sqlite3 预编译。
  await installPrebuiltSqlite(appRoot, platform, arch);

  // 5) 复制 webui 启动脚本/双击包装/配置示例/README 到 stageRoot。
  for (const name of [
    "open-design.sh",
    "open-design.cmd",
    "webui.config.example.json",
    "README.md",
  ]) {
    await cp(join(webuiResourcesRoot, name), join(stageRoot, name));
  }
  await chmod(join(stageRoot, "open-design.sh"), 0o755);
  if (platform === "mac") {
    await cp(join(webuiResourcesRoot, "launch-mac.command"), join(stageRoot, "Open Design WebUI.command"));
    await chmod(join(stageRoot, "Open Design WebUI.command"), 0o755);
  } else if (platform === "win") {
    await cp(join(webuiResourcesRoot, "launch-win.bat"), join(stageRoot, "Open Design WebUI.bat"));
  } else {
    await cp(join(webuiResourcesRoot, "open-design-webui.desktop"), join(stageRoot, "open-design-webui.desktop"));
  }

  // 6) 压缩。
  const kind = webuiArchiveKind(platform);
  const archivePath = join(config.roots.output.platformRoot, webuiArchiveName({ platform, arch, version }));
  const sevenZip = platform === "win" ? winResources.sevenZipExe : null;
  await createWebuiArchive(stageRoot, archivePath, kind, sevenZip);

  return { platform, arch, archivePath, stageRoot };
}
```

> 执行提示：`copyResourceTree` 当前会复制 `bin/node`（见 `linux.ts:457-460`）。webui 要求系统 node，不应捆绑 node。在 Step 6 提取时给 `copyResourceTree` 增加 `includeNodeBinary` 参数（默认 true 保持 linux 行为；webui 传 false）。`winResources` 是否已从 `resources.ts` 导出需在执行时确认（见 `resources.ts` 的 `winResources`），未导出则补 `export`。第 1 步 `ensureWorkspaceBuildArtifacts` 的精确调用形态以 `packLinux`（`linux.ts:616`）为范本。

- [ ] **Step 8: typecheck + linux 回归**

Run:
```bash
pnpm --filter @open-design/tools-pack typecheck
pnpm --filter @open-design/tools-pack test
```
Expected: 通过；linux 组装相关用例仍绿。

- [ ] **Step 9: 提交**

```bash
git add tools/pack/src/webui.ts tools/pack/src/assemble.ts tools/pack/src/linux.ts tools/pack/src/config.ts tools/pack/src/resources.ts tools/pack/tests/webui.test.ts
git commit -m "feat(tools-pack): webui 组装、better-sqlite3 预编译选择与压缩"
```

---

### Task 6: 注册 tools-pack webui 命令

**Files:**
- Modify: `tools/pack/src/index.ts`

- [ ] **Step 1: 注册命令**

Modify `tools/pack/src/index.ts`：import `buildPackedWebui` 与 `webuiArchiveName`，仿照 mac 命令注册块新增（`--arch` 选项通过 `addSharedOptions` 之外单独 `.option`）：

```typescript
addSharedOptions(
  cli
    .command("webui <action>", "WebUI packaging commands: build")
    .option("--arch <arch>", "Target arch: x64|arm64 (default: host arch)"),
).action(async (action: string, options: CliOptions) => {
  const platform = options.to as ToolPackPlatform; // --to mac|win|linux
  // webui 双进程统一用 server 模式（与现有 Linux headless 一致、已验证可运行）；
  // 覆盖各平台默认，避免 mac/win 落到 standalone 而 linux 落到 server 的不一致。
  const config = { ...resolveToolPackConfig(platform, options), webOutputMode: "server" as const };
  switch (action) {
    case "build":
      printJson(await buildPackedWebui(config));
      return;
    default:
      throw new Error(`unknown webui action: ${action} (expected build)`);
  }
});
```

> 若 `--to` 现有取值校验不接受 `mac|win|linux` 作为平台选择器，改为新增 `--platform <mac|win|linux>` 选项并据此调用 `resolveToolPackConfig`。执行时先读 `tools/pack/src/config.ts` 的 `resolveToolPackBuildOutput` 与 `ToolPackPlatform` 取值确认。

- [ ] **Step 2: typecheck + 构建**

Run:
```bash
pnpm --filter @open-design/tools-pack typecheck
pnpm --filter @open-design/tools-pack build
```
Expected: 通过。

- [ ] **Step 3: 提交**

```bash
git add tools/pack/src/index.ts
git commit -m "feat(tools-pack): 注册 webui build 命令"
```

---

### Task 7: 端到端冒烟与文档

**Files:**
- Modify: `tools/pack/AGENTS.md`
- （验证）无新增源文件

- [ ] **Step 1: 实跑一次本平台构建**

Run（在 Linux 主机示例）：
```bash
pnpm install
pnpm tools-pack webui build --to linux --arch x64 --json
```
Expected: 输出 JSON 含 `archivePath` 指向 `open-design-webui-<ver>-linux-x64.tar.gz`，文件存在。

- [ ] **Step 2: 解压并端到端启动/状态/停止**

Run:
```bash
WORK=$(mktemp -d)
tar -xzf <archivePath> -C "$WORK"
"$WORK/open-design.sh" start --port 7466 --no-open --json &
sleep 8
curl -fsS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:7466   # 期望 200
"$WORK/open-design.sh" status --json                                # 期望 running + url
"$WORK/open-design.sh" stop --json                                  # 期望停止
```
Expected: HTTP 200；status 报告 running；stop 后进程退出。
若失败：查 `~/.local/share/open-design/namespaces/<ns>/logs/desktop/latest.log`。

- [ ] **Step 3: 远程 token 行为人工核验**

Run:
```bash
"$WORK/open-design.sh" start --host 0.0.0.0 --port 7467 --no-open &
sleep 8
# 终端应打印「已自动生成 token」
curl -fsS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:7467/api/version        # 环回豁免 -> 200
curl -fsS -o /dev/null -w "%{http_code}\n" http://<lan-ip>:7467/api/version          # 非环回无 token -> 401
"$WORK/open-design.sh" stop
```
Expected: 环回 200、非环回 401（验证 §3 token 语义）。

- [ ] **Step 4: 更新 AGENTS.md**

Modify `tools/pack/AGENTS.md` 的 "Owns" 列表追加一行：

```markdown
- Cross-platform WebUI (no-Electron) build via `tools-pack webui build --to <mac|win|linux> [--arch]`; terminal launcher with start/stop/status, configurable port/host/token, browser auto-open when a display is present.
```

- [ ] **Step 5: guard + 全量 typecheck**

Run:
```bash
pnpm guard
pnpm typecheck
```
Expected: 通过。

- [ ] **Step 6: 提交**

```bash
git add tools/pack/AGENTS.md
git commit -m "docs(tools-pack): 记录 webui 打包子命令"
```

---

## 验证矩阵（收尾）

```bash
pnpm --filter @open-design/packaged test
pnpm --filter @open-design/packaged typecheck
pnpm --filter @open-design/tools-pack test
pnpm --filter @open-design/tools-pack typecheck
pnpm guard
pnpm typecheck
```

跨平台产物（mac/win）需在对应平台或可拉到对应 `better-sqlite3` 预编译的环境验证 Task 7 的解压→start→stop 流程。
