// config.ts - Config loading with import support
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  renameSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve, dirname } from "node:path";

import type {
  McpConfig,
  ServerEntry,
  McpSettings,
  ImportKind,
  ServerProvenance,
} from "./types.js";

const DEFAULT_CONFIG_PATH = join(homedir(), ".pi", "agent", "mcp.json");
const PROJECT_CONFIG_NAME = ".pi/mcp.json";
// Import source paths for other tools
const IMPORT_PATHS: Record<ImportKind, string> = {
  "claude-code": join(homedir(), ".claude", "claude_desktop_config.json"),
  "claude-desktop": join(
    homedir(),
    "Library",
    "Application Support",
    "Claude",
    "claude_desktop_config.json"
  ),
  codex: join(homedir(), ".codex", "config.json"),
  cursor: join(homedir(), ".cursor", "mcp.json"),
  // Relative to project.
  vscode: ".vscode/mcp.json",
  windsurf: join(homedir(), ".windsurf", "mcp.json"),
};
export const loadMcpConfig = (overridePath?: string): McpConfig => {
  const configPath = overridePath ? resolve(overridePath) : DEFAULT_CONFIG_PATH;
  // Load base config
  let config: McpConfig = { mcpServers: {} };
  if (existsSync(configPath)) {
    try {
      const raw = JSON.parse(readFileSync(configPath, "utf-8"));
      config = validateConfig(raw);
    } catch (error) {
      console.warn(`Failed to load MCP config from ${configPath}:`, error);
    }
  }
  // Process imports from other tools
  if (config.imports?.length) {
    for (const importKind of config.imports) {
      const importPath = IMPORT_PATHS[importKind];
      if (!importPath) {
        continue;
      }
      const fullPath = importPath.startsWith(".")
        ? resolve(process.cwd(), importPath)
        : importPath;
      if (!existsSync(fullPath)) {
        continue;
      }
      try {
        const imported = JSON.parse(readFileSync(fullPath, "utf-8"));
        const servers = extractServers(imported, importKind);
        // Merge - local config takes precedence over imports
        for (const [name, def] of Object.entries(servers)) {
          if (!config.mcpServers[name]) {
            config.mcpServers[name] = def;
          }
        }
      } catch (error) {
        console.warn(`Failed to import MCP config from ${importKind}:`, error);
      }
    }
  }
  // Check for project-local config (skip if it's the same as the main config)
  const projectPath = resolve(process.cwd(), PROJECT_CONFIG_NAME);
  if (existsSync(projectPath) && projectPath !== configPath) {
    try {
      const projectConfig = JSON.parse(readFileSync(projectPath, "utf-8"));
      const validated = validateConfig(projectConfig);
      // Project config overrides everything
      config.mcpServers = { ...config.mcpServers, ...validated.mcpServers };
      if (validated.settings) {
        config.settings = { ...config.settings, ...validated.settings };
      }
    } catch (error) {
      console.warn(`Failed to load project MCP config:`, error);
    }
  }
  return config;
};
const validateConfig = (raw: unknown): McpConfig => {
  if (!raw || typeof raw !== "object") {
    return { mcpServers: {} };
  }
  const obj = raw as Record<string, unknown>;
  const servers = obj.mcpServers ?? obj["mcp-servers"] ?? {};
  // Must be a plain object, not an array or null
  if (
    typeof servers !== "object" ||
    servers === null ||
    Array.isArray(servers)
  ) {
    return { mcpServers: {} };
  }
  return {
    imports: Array.isArray(obj.imports)
      ? (obj.imports as ImportKind[])
      : undefined,
    mcpServers: servers as Record<string, ServerEntry>,
    settings: obj.settings as McpSettings | undefined,
  };
};
const extractServers = (
  config: unknown,
  kind: ImportKind
): Record<string, ServerEntry> => {
  if (!config || typeof config !== "object") {
    return {};
  }
  const obj = config as Record<string, unknown>;
  let servers: unknown;
  switch (kind) {
    case "claude-desktop":
    case "claude-code":
    case "codex": {
      servers = obj.mcpServers;
      break;
    }
    case "cursor":
    case "windsurf":
    case "vscode": {
      servers = obj.mcpServers ?? obj["mcp-servers"];
      break;
    }
    default: {
      return {};
    }
  }
  if (!servers || typeof servers !== "object" || Array.isArray(servers)) {
    return {};
  }
  return servers as Record<string, ServerEntry>;
};
export const getServerProvenance = (
  overridePath?: string
): Map<string, ServerProvenance> => {
  const provenance = new Map<string, ServerProvenance>();
  const userPath = overridePath ? resolve(overridePath) : DEFAULT_CONFIG_PATH;
  let userConfig: McpConfig = { mcpServers: {} };
  if (existsSync(userPath)) {
    try {
      userConfig = validateConfig(JSON.parse(readFileSync(userPath, "utf-8")));
    } catch {
      // Ignore best-effort cleanup errors.
    }
  }
  for (const name of Object.keys(userConfig.mcpServers)) {
    provenance.set(name, { kind: "user", path: userPath });
  }
  if (userConfig.imports?.length) {
    for (const importKind of userConfig.imports) {
      const importPath = IMPORT_PATHS[importKind];
      if (!importPath) {
        continue;
      }
      const fullPath = importPath.startsWith(".")
        ? resolve(process.cwd(), importPath)
        : importPath;
      if (!existsSync(fullPath)) {
        continue;
      }
      try {
        const imported = JSON.parse(readFileSync(fullPath, "utf-8"));
        const servers = extractServers(imported, importKind);
        for (const name of Object.keys(servers)) {
          if (!provenance.has(name)) {
            provenance.set(name, {
              importKind,
              kind: "import",
              path: userPath,
            });
          }
        }
      } catch {
        // Ignore best-effort cleanup errors.
      }
    }
  }
  const projectPath = resolve(process.cwd(), PROJECT_CONFIG_NAME);
  if (existsSync(projectPath) && projectPath !== userPath) {
    try {
      const projectConfig = validateConfig(
        JSON.parse(readFileSync(projectPath, "utf-8"))
      );
      for (const name of Object.keys(projectConfig.mcpServers)) {
        provenance.set(name, { kind: "project", path: projectPath });
      }
    } catch {
      // Ignore best-effort cleanup errors.
    }
  }
  return provenance;
};
export const writeDirectToolsConfig = (
  changes: Map<string, true | string[] | false>,
  provenance: Map<string, ServerProvenance>,
  fullConfig: McpConfig
): void => {
  const byPath = new Map<
    string,
    {
      name: string;
      value: true | string[] | false;
      prov: ServerProvenance;
    }[]
  >();
  for (const [serverName, value] of changes) {
    const prov = provenance.get(serverName);
    if (!prov) {
      continue;
    }
    const targetPath = prov.path;
    const pathEntries = byPath.get(targetPath) ?? [];
    pathEntries.push({ name: serverName, prov, value });
    byPath.set(targetPath, pathEntries);
  }
  for (const [filePath, entries] of byPath) {
    let raw: Record<string, unknown> = {};
    if (existsSync(filePath)) {
      try {
        raw = JSON.parse(readFileSync(filePath, "utf-8"));
      } catch {
        // Ignore best-effort cleanup errors.
      }
    }
    if (!raw || typeof raw !== "object") {
      raw = {};
    }
    const servers = (raw.mcpServers ?? raw["mcp-servers"] ?? {}) as Record<
      string,
      ServerEntry
    >;
    if (typeof servers !== "object" || Array.isArray(servers)) {
      continue;
    }
    for (const { name, value, prov } of entries) {
      if (prov.kind === "import") {
        const fullDef = fullConfig.mcpServers[name];
        if (fullDef) {
          servers[name] = { ...fullDef, directTools: value };
        }
      } else if (servers[name]) {
        servers[name] = { ...servers[name], directTools: value };
      }
    }
    const key =
      raw["mcp-servers"] && !raw.mcpServers ? "mcp-servers" : "mcpServers";
    raw[key] = servers;
    mkdirSync(dirname(filePath), { recursive: true });
    const tmpPath = `${filePath}.${process.pid}.tmp`;
    writeFileSync(tmpPath, `${JSON.stringify(raw, null, 2)}\n`, "utf-8");
    renameSync(tmpPath, filePath);
  }
};
