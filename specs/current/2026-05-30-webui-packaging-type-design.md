# 设计：跨平台「WebUI」打包类型

- 日期：2026-05-30
- 状态：已确认设计，待写实现计划
- 范围：新增一种打包类型，把 daemon+web 运行时打成终端启动、跨平台、可配置的包（不含 Electron）

## 1. 背景与目标

当前打包产物只有 Windows / mac 的 GUI 安装包（Electron）。需要新增「WebUI」打包类型，满足：

1. 跨平台支持（Windows、mac、Linux）。
2. 终端启动；GUI 系统双击后弹出终端窗口，终端打印访问地址；若系统有浏览器则直接打开对应 URL。
3. 非 GUI 系统用终端启动，启动后终端打印访问地址。
4. 支持启动参数或配置文件配置：token、端口、远程访问。
5. 同时提供启动命令和停止命令。

## 2. 设计决策（已确认）

| 项 | 决策 |
| --- | --- |
| 运行时 | 捆绑系统 Node + 脚本，复用现有 `apps/packaged/src/headless.ts` 启动路径，不含 Electron |
| 部署形态 | 双进程（daemon + web Next.js 进程，`OD_WEB_OUTPUT_MODE=server`）；浏览器访问 web 端口 |
| 命令形态 | 单一启动器 + 子命令：`open-design start / stop / status` |
| 配置文件 | 启动器同级目录 `webui.config.json`（JSON）；优先级：命令行参数 > 配置文件 > 环境变量 > 默认值 |
| 远程 + token 语义 | token 仅保护 daemon `/api`（给程序化客户端）；Web UI 远程访问不强制 token（前端当前不携带 token，经 web 同机环回代理访问 daemon，环回豁免） |
| 远程无 token | 绑定非环回 host 且未给 token 时，自动生成强 token 并打印（供 API 客户端使用） |
| Node 运行时 | 要求系统已装 Node 24；仅 `better-sqlite3` 原生模块按平台预编译 |
| 构建产物 | 每平台一个压缩包，`tools-pack webui build --to <平台>` |

## 3. 运行时架构与网络模型（双进程）

webui 运行时复用 `startPackagedSidecars` 启动两个子进程：

- **daemon**：HTTP API + 业务逻辑。绑定 `OD_BIND_HOST`（默认 `127.0.0.1`），端口 `OD_PORT`（可动态）。`OD_API_TOKEN` 保护 `/api`，但对环回来源豁免。
- **web**（Next.js 进程，`OD_WEB_OUTPUT_MODE=server`）：浏览器访问的前端。监听 host `OD_HOST`（`apps/web/sidecar/server.ts:30`，默认 `127.0.0.1`），端口 `OD_WEB_PORT` / `PORT`。web 把 `/api` 代理到 daemon，代理目标恒为 `127.0.0.1`（`apps/web/next.config.ts:12`、`apps/web/sidecar/server.ts` 的 `DAEMON_HOST`）。

由此推导出配置到环境变量的映射：

| 启动器配置 | 作用对象 | 环境变量 | 默认 |
| --- | --- | --- | --- |
| `port` | web（浏览器访问端口） | `OD_WEB_PORT` 与 `PORT` | 7456 |
| `host` | web 监听 + daemon 绑定 | web `OD_HOST` 同时 daemon `OD_BIND_HOST` | 127.0.0.1 |
| `token` | daemon API | `OD_API_TOKEN` | 无 |

安全语义校验：

- 本地访问 `http://127.0.0.1:<port>`：web→daemon 环回，UI 完整可用，无需 token。
- 远程访问 `http://<lan-ip>:<port>`：web 监听 `0.0.0.0` 可达；web→daemon 仍走 `127.0.0.1` 环回 ⇒ 远程用户经 UI 操作不需要 token（符合「UI 远程不强制」）。
- 远程程序化客户端直连 daemon `/api`：源为非环回 ⇒ 需要 `Authorization: Bearer <token>`（符合「token 仅护 API」）。daemon 绑定非环回时强制要求 token，故未提供时自动生成。

> 注：当前 web 前端不读取/携带 token（仓库内无 `?token=` / `Authorization: Bearer` 处理）。本特性不改前端 token 行为；远程 Web UI 的访问控制由用户自行用反向代理 / VPN / 网络隔离负责，README 须明确说明。

## 4. 复用的现有能力

- `apps/packaged/src/headless.ts`：已能在无 Electron 下启动 daemon+web sidecar、建立 IPC（STATUS/SHUTDOWN）、打印 URL。webui-launcher 的 start 在其基础上扩展（增加配置解析、网络注入、浏览器打开、start/stop/status 子命令）。
- `apps/daemon/src/browser-open.ts` 的 `openBrowser()` / `createBrowserOpenInvocation()`：已跨平台（`open` / `xdg-open` / `cmd start`），对缺失 opener 安全（尽力而为，失败仅告警不崩溃）。
- daemon 的绑定校验：`apps/daemon/src/server.ts:3819-3826`，非环回 host 且无 `OD_API_TOKEN` 时抛错（报错文案含 `openssl rand -hex 32` 提示）。
- `tools/pack/src/linux.ts` 的组装流程（`writeAssembledApp`、`runProductionInstall`、`copyResourceTree`）与 `tools/pack/src/workspace-build.ts` 的 `ensureWorkspaceBuildArtifacts`：作为 webui 构建的组装与产物来源参考。

### 需要改造的注入点

现有 `startPackagedSidecars`（`apps/packaged/src/sidecars.ts`）把 daemon 子进程的 `OD_PORT`（即 `SIDECAR_ENV.DAEMON_PORT`）硬编码为 `"0"`，且**不注入** `OD_BIND_HOST` / `OD_API_TOKEN`；web 子进程也不注入 `OD_HOST` / 固定 `OD_WEB_PORT`。因此需要给 `startPackagedSidecars` 增加可选的 `network` 选项，并在 `buildPackagedDaemonSpawnEnv`（daemon）与 web 子进程 env 构造处注入上表的环境变量。该改造对现有 headless / Electron 调用保持默认行为不变（不传 `network` 时维持动态端口 + 环回 + 无 token）。

## 5. 产物结构

构建命令：

```
tools-pack webui build --to <mac|win|linux> [--arch <x64|arm64>] [--app-version <ver>] [--json]
```

每平台一个压缩包（mac/win → `.zip`，linux → `.tar.gz`）：

```
open-design-webui-<版本>-<os>-<arch>.(zip|tar.gz)
  app/                         # 组装好的 node 应用：daemon dist + web 产物(server 模式) + packaged dist
    node_modules/              # 生产依赖，含本平台预编译的 better-sqlite3
  bin/open-design              # 启动器外壳脚本 -> 调 `node app/.../webui-launcher.mjs`
  Open Design WebUI.command    # mac 双击 -> 打开 Terminal 运行 `open-design start`
  Open Design WebUI.bat        # win 双击 -> 打开 cmd 窗口运行 start
  open-design-webui.desktop    # linux 双击（Terminal=true）；附 start.sh 兜底
  webui.config.example.json
  README(.md)
```

原生模块策略：要求系统 Node 24（24.x 内 ABI 137 稳定），故只有 `better-sqlite3` 的预编译产物按平台/架构区分。构建时通过 `prebuild-install --platform/--arch`（或等价方式）拉取目标平台预编译二进制放入 `app/node_modules`，受支持平台无需本机编译器。跨架构构建需目标平台预编译包存在。

web 输出模式：webui 统一用 `OD_WEB_OUTPUT_MODE=server`（与现有 Linux headless 一致、已验证可在打包后运行的双进程组合）；构建命令层覆盖各平台默认，避免 mac/win 落到 standalone、linux 落到 server 的不一致。

## 6. 启动器 CLI

新入口（位于 `apps/packaged`，例如 `webui-launcher.ts`，编译产物 `dist/webui-launcher.mjs`）。`bin/open-design` 外壳脚本负责定位系统 node 并转发参数。

```
open-design start [--port N] [--host ADDR] [--token T] [--no-open] [--config PATH] [--json]
open-design stop  [--json]
open-design status [--json]
```

### 配置解析（需求 4）

优先级：命令行参数 > `webui.config.json`（自动发现，启动器同级目录）> `OD_*` 环境变量 > 默认值。纯函数 `resolveWebuiConfig(...)`，便于单测。

配置键：

```json
{
  "port": 7456,
  "host": "0.0.0.0",
  "token": "s3cr3t",
  "openBrowser": true,
  "namespace": "default",
  "dataDir": null
}
```

- `--config PATH` 可显式指定配置文件路径（覆盖自动发现）。
- 解析结果映射为 §3 表中的环境变量后再启动运行时。

### Node 检查

外壳脚本（`bin/open-design` 及各双击包装）先校验 `node --version` ≥ 24；缺失或版本过低时给出清晰的安装/升级提示并退出（双击 GUI 会话的 PATH 可能不含 node，这里必须有明确报错）。

### start

1. 解析配置（`resolveWebuiConfig`）。
2. 若 `host` 为非环回地址且未提供 token → 生成强随机 token（`odtoken_<base64url(randomBytes(32))>`），在终端醒目打印（供 API 客户端使用）。
3. 调 `startPackagedSidecars` 并传入 `network: { webHost, webPort, daemonBindHost, apiToken }`。
4. 写 `webui-root.json`（pid、url、startedAt）到命名空间 runtime 目录。
5. 打印访问 URL（本机 `http://<host or localhost>:<port>`）。
6. 按 §7 GUI 规则尝试打开浏览器。
7. 建立 IPC server（复用现有 STATUS/SHUTDOWN handler），监听 SIGINT/SIGTERM 优雅关停。

### stop

读取 `webui-root.json`，通过 IPC 发送 `SHUTDOWN`（现有机制）；IPC 不可达时回退到向 pid 发信号；随后清理 identity 文件。

### status

通过 IPC 发送 `STATUS`，打印运行状态与 URL；`--json` 输出机器可读结果。

## 7. GUI 与非 GUI 行为（需求 2、3）

- 双击包装（`.command` / `.bat` / `.desktop`）打开一个**终端窗口**并运行 `open-design start`，因此 GUI 用户能看到终端输出和 URL。
- `openBrowser` 默认按 `auto` 处理：仅在检测到显示设备时打开浏览器。判定 `hasDisplay(platform, env)`：
  - Windows：视为有显示。
  - mac：有显示，除非检测到 `SSH_CONNECTION`（远程会话不开浏览器）。
  - Linux：仅当存在 `DISPLAY` 或 `WAYLAND_DISPLAY`。
- 无 GUI 服务器：仅打印 URL 并继续运行（满足需求 3）。
- `--no-open` 或 `openBrowser: false` 强制关闭自动开浏览器。
- 打开浏览器复用 `openBrowser()`，本身尽力而为，失败仅告警。

## 8. 边界与一致性

- `webui-root.json` 为 packaged 本地 identity 文件，不是 web/daemon API DTO，**无需改动 `packages/contracts`**。
- 本特性属于打包/工具链能力（`tools/pack` 构建命令 + packaged 启动器），不是产品业务能力，因此 AGENTS.md「UI + od CLI 双轨」规则不适用——启动器本身即 CLI 面，没有对应的 web UI 面。**会在 PR 说明里点明这一点，避免 review 误判为缺失 UI 面。**
- 进程身份/命名空间/路径沿用现有 sidecar 约定，不引入第二套进程身份模型；不手搓 `--od-stamp-*`，用 `createProcessStampArgs`。
- pack 资源文件放在 `tools/pack/resources/` 下（新增 `tools/pack/resources/webui/`）。
- `startPackagedSidecars` 的 `network` 改造必须保持现有 headless / Electron 调用的默认行为不变（默认动态端口 + 环回 + 无 token）。

## 9. 测试策略

- `apps/packaged` 单测（vitest，`tests/*.test.ts`）：
  - `resolveWebuiConfig` 优先级（命令行 > 配置文件 > 环境变量 > 默认）。
  - 远程访问无 token 时自动生成 token 的逻辑。
  - `hasDisplay()` 在各平台/各环境变量下的判定。
  - argv 解析与 `--config` / `--no-open` 等开关。
  - `buildPackagedDaemonSpawnEnv` 在传/不传 `network` 时的环境变量分支（保持默认行为不变）。
- `tools/pack` 单测（vitest）：
  - webui 压缩包文件清单（app/、bin/open-design、各双击包装、配置示例、README 均存在）。
  - 按 `--to` 选对 `better-sqlite3` 预编译产物。
- 冒烟：解压产物 → `open-design start` → 轮询 URL 返回 200 → `open-design status` → `open-design stop`（按平台可选门控）。

## 10. 风险与缓解

- **Linux 双击差异**：不同桌面环境对 `.desktop` / 可执行脚本双击行为不一致 → 终端启动为主路径，双击为尽力而为，README 说明。
- **跨架构 better-sqlite3 预编译缺失**：构建目标架构时若无对应预编译包则失败 → 构建前校验并给出明确报错，文档列出受支持的 os/arch 组合。
- **GUI 会话 PATH 缺少 node**：双击启动可能找不到 node → 外壳脚本显式检测并报错，提示安装 Node 24。
- **远程 Web UI 无应用层鉴权**：token 不护 UI（前端不携带）→ README 明确要求用户用反向代理 / VPN / 网络隔离保护远程暴露面。

## 11. 不在本次范围（YAGNI）

- 不引入自包含单可执行文件（SEA/pkg）方案。
- 不复用 Electron 无窗口模式。
- 不改 web 前端的 token 携带行为（不做 `?token=` 前端读取）。
- 不接入产品自动更新（updater）流程。
- 不做系统服务/守护进程注册（systemd/launchd/Windows 服务）——仅前台终端进程 + start/stop。
