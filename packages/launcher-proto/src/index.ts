export const LAUNCHER_CONFIG_SCHEMA_VERSION = 1;
export const RUNTIME_CONFIG_SCHEMA_VERSION = 1;
export const RUNTIME_ATTEMPT_SCHEMA_VERSION = 1;
export const DEFAULT_RUNTIME_CONFIG_FILE = "runtime.json";
export const DEFAULT_RUNTIME_ATTEMPT_PATH = "state/attempt.json";
export const LOOPBACK_HOST = "127.0.0.1";

export const RUNTIME_APPS = Object.freeze({
  DAEMON: "daemon",
  DESKTOP: "desktop",
  WEB: "web",
} as const);

export type RuntimeApp = (typeof RUNTIME_APPS)[keyof typeof RUNTIME_APPS];

export const RUNTIME_MODES = Object.freeze({
  DEV: "dev",
  PACKAGED: "packaged",
} as const);

export type RuntimeMode = (typeof RUNTIME_MODES)[keyof typeof RUNTIME_MODES];

export const RUNTIME_SOURCES = Object.freeze({
  LAUNCHER: "launcher",
  TOOLS_DEV: "tools-dev",
  TOOLS_PACK: "tools-pack",
} as const);

export type RuntimeSource = (typeof RUNTIME_SOURCES)[keyof typeof RUNTIME_SOURCES];

declare const endpointBrand: unique symbol;
declare const namespaceBrand: unique symbol;

export type RuntimeEndpoint = string & { readonly [endpointBrand]: true };
export type RuntimeNamespace = string & { readonly [namespaceBrand]: true };

export type LauncherEntry = {
  args: string[];
  cwd?: string;
  env: Record<string, string>;
  executable: string;
};

export type LauncherConfig = {
  attemptPath?: string;
  runtimePath: string;
  schemaVersion: typeof LAUNCHER_CONFIG_SCHEMA_VERSION;
};

export type RuntimeAppDescriptor = {
  endpoint: RuntimeEndpoint;
  entry: LauncherEntry;
};

export type RuntimeAppsDescriptor = Partial<Record<RuntimeApp, RuntimeAppDescriptor>>;

export type RuntimeVersionDescriptor = {
  apps: RuntimeAppsDescriptor;
  entry: LauncherEntry;
  root: string;
  version: string;
};

export type RuntimeConfig = {
  active: RuntimeVersionDescriptor;
  generation: number;
  lastSuccessful: RuntimeVersionDescriptor;
  mode: RuntimeMode;
  namespace: RuntimeNamespace;
  namespaceRoot: string;
  schemaVersion: typeof RUNTIME_CONFIG_SCHEMA_VERSION;
  source: RuntimeSource;
};

export type RuntimeAttempt = {
  generation: number;
  schemaVersion: typeof RUNTIME_ATTEMPT_SCHEMA_VERSION;
  version: string;
};

export class LauncherProtoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LauncherProtoError";
  }
}

export type LauncherEntryInput = {
  args?: readonly string[];
  cwd?: string | null;
  env?: Record<string, string>;
  executable: string;
};

export type RuntimeAppInput = {
  endpoint: RuntimeEndpoint | string;
  entry: LauncherEntryInput;
};

export type RuntimeAppsInput = Partial<Record<RuntimeApp, RuntimeAppInput>>;

export type RuntimeVersionInput = {
  apps?: RuntimeAppsInput | Record<string, RuntimeAppInput | undefined>;
  entry: LauncherEntryInput;
  root: string;
  version: string;
};

export type RuntimeConfigInput = {
  active: RuntimeVersionInput;
  generation: number;
  lastSuccessful: RuntimeVersionInput;
  mode: RuntimeMode | string;
  namespace: RuntimeNamespace | string;
  namespaceRoot: string;
  source: RuntimeSource | string;
};

export type LauncherConfigInput = {
  attemptPath?: string | null;
  runtimePath?: string | null;
};

export function buildLauncherConfig(input: LauncherConfigInput = {}): LauncherConfig {
  const runtimePath = input.runtimePath == null
    ? DEFAULT_RUNTIME_CONFIG_FILE
    : nonEmptyString(input.runtimePath, "runtimePath");
  const attemptPath = input.attemptPath == null
    ? undefined
    : nonEmptyString(input.attemptPath, "attemptPath");
  return {
    ...(attemptPath == null ? {} : { attemptPath }),
    runtimePath,
    schemaVersion: LAUNCHER_CONFIG_SCHEMA_VERSION,
  };
}

export function buildRuntimeConfig(input: RuntimeConfigInput): RuntimeConfig {
  return {
    active: buildRuntimeVersion(input.active, "active"),
    generation: normalizeGeneration(input.generation),
    lastSuccessful: buildRuntimeVersion(input.lastSuccessful, "lastSuccessful"),
    mode: normalizeMode(input.mode),
    namespace: normalizeNamespace(input.namespace),
    namespaceRoot: nonEmptyString(input.namespaceRoot, "namespaceRoot"),
    schemaVersion: RUNTIME_CONFIG_SCHEMA_VERSION,
    source: normalizeSource(input.source),
  };
}

export function buildRuntimeVersion(input: RuntimeVersionInput, label: string): RuntimeVersionDescriptor {
  return {
    apps: buildRuntimeApps(input.apps ?? {}),
    entry: normalizeEntry(input.entry, `${label}.entry`),
    root: nonEmptyString(input.root, `${label}.root`),
    version: nonEmptyString(input.version, `${label}.version`),
  };
}

export function buildRuntimeApps(input: RuntimeAppsInput | Record<string, RuntimeAppInput | undefined>): RuntimeAppsDescriptor {
  const apps: RuntimeAppsDescriptor = {};
  for (const [key, value] of Object.entries(input)) {
    if (value == null) continue;
    const app = normalizeApp(key);
    apps[app] = {
      endpoint: normalizeEndpoint(value.endpoint),
      entry: normalizeEntry(value.entry, `${app}.entry`),
    };
  }
  return apps;
}

export function buildAttempt(generation: number, version: string): RuntimeAttempt {
  return {
    generation: normalizeGeneration(generation),
    schemaVersion: RUNTIME_ATTEMPT_SCHEMA_VERSION,
    version: nonEmptyString(version, "version"),
  };
}

export function createEndpoint(port: number): RuntimeEndpoint {
  return normalizeEndpoint(`tcp://${LOOPBACK_HOST}:${normalizePort(port, "port")}`);
}

export function normalizeEndpoint(value: unknown): RuntimeEndpoint {
  const endpoint = nonEmptyString(value, "endpoint");
  const prefix = `tcp://${LOOPBACK_HOST}:`;
  if (!endpoint.startsWith(prefix)) {
    throw protoError(`endpoint must use tcp://${LOOPBACK_HOST}:<port>: ${endpoint}`);
  }
  const portText = endpoint.slice(prefix.length);
  if (!/^[0-9]+$/.test(portText)) {
    throw protoError(`endpoint port must be between 1 and 65535: ${endpoint}`);
  }
  const port = Number(portText);
  if (String(port) !== portText || !Number.isInteger(port) || port <= 0 || port > 65535) {
    throw protoError(`endpoint port must be between 1 and 65535: ${endpoint}`);
  }
  return endpoint as RuntimeEndpoint;
}

export function normalizeNamespace(value: unknown): RuntimeNamespace {
  const namespace = nonEmptyString(value, "namespace");
  if (namespace.trim() !== namespace) throw protoError(`namespace must not contain leading or trailing whitespace: ${namespace}`);
  if (/[\\/]/.test(namespace)) throw protoError(`namespace must not contain path separators: ${namespace}`);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(namespace)) {
    throw protoError(`namespace contains unsupported characters: ${namespace}`);
  }
  return namespace as RuntimeNamespace;
}

export function normalizeApp(value: unknown): RuntimeApp {
  if (value === RUNTIME_APPS.DAEMON || value === RUNTIME_APPS.DESKTOP || value === RUNTIME_APPS.WEB) return value;
  throw protoError(`unsupported runtime app: ${String(value)}`);
}

export function normalizeMode(value: unknown): RuntimeMode {
  if (value === RUNTIME_MODES.DEV || value === RUNTIME_MODES.PACKAGED) return value;
  throw protoError(`unsupported runtime mode: ${String(value)}`);
}

export function normalizeSource(value: unknown): RuntimeSource {
  if (value === RUNTIME_SOURCES.LAUNCHER || value === RUNTIME_SOURCES.TOOLS_DEV || value === RUNTIME_SOURCES.TOOLS_PACK) return value;
  throw protoError(`unsupported runtime source: ${String(value)}`);
}

function normalizeEntry(input: LauncherEntryInput, label: string): LauncherEntry {
  if (input == null || typeof input !== "object") throw protoError(`${label} must be an object`);
  return {
    args: normalizeArgs(input.args ?? [], `${label}.args`),
    ...(input.cwd == null ? {} : { cwd: nonEmptyString(input.cwd, `${label}.cwd`) }),
    env: normalizeEnv(input.env ?? {}, `${label}.env`),
    executable: nonEmptyString(input.executable, `${label}.executable`),
  };
}

function normalizeArgs(input: readonly string[], label: string): string[] {
  if (!Array.isArray(input)) throw protoError(`${label} must be an array`);
  return input.map((entry, index) => {
    if (typeof entry !== "string") throw protoError(`${label}[${index}] must be a string`);
    return entry;
  });
}

function normalizeEnv(input: Record<string, string>, label: string): Record<string, string> {
  if (input == null || typeof input !== "object" || Array.isArray(input)) throw protoError(`${label} must be an object`);
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (key.length === 0) throw protoError(`${label} key must not be empty`);
    if (typeof value !== "string") throw protoError(`${label}.${key} must be a string`);
    env[key] = value;
  }
  return env;
}

function normalizeGeneration(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw protoError(`generation must be a non-negative safe integer: ${value}`);
  return value;
}

function normalizePort(value: number, label: string): number {
  if (!Number.isInteger(value) || value <= 0 || value > 65535) throw protoError(`${label} must be between 1 and 65535: ${value}`);
  return value;
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string") throw protoError(`${label} must be a string`);
  if (value.trim().length === 0) throw protoError(`${label} must not be empty`);
  return value;
}

function protoError(message: string): LauncherProtoError {
  return new LauncherProtoError(message);
}
