import type { ExtensionAPI, ToolInfo } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";

import {
  showStatus,
  showTools,
  reconnectServers,
  authenticateServer,
  removeAuth,
  openMcpPanel,
} from "./commands.js";
import { loadMcpConfig } from "./config.js";
import {
  buildProxyDescription,
  createDirectToolExecutor,
  renderDirectToolCall,
  resolveDirectTools,
} from "./direct-tools.js";
import { flushMetadataCache, initializeMcp, updateStatusBar } from "./init.js";
import { McpOAuthCallback } from "./mcp-oauth-callback.js";
import { loadMetadataCache } from "./metadata-cache.js";
import {
  executeCall,
  executeConnect,
  executeDescribe,
  executeList,
  executeSearch,
  executeStatus,
  executeUiMessages,
} from "./proxy-modes.js";
import type { McpExtensionState } from "./state.js";
import { getConfigPathFromArgv, truncateAtWord } from "./utils.js";

interface McpProxyParams {
  tool?: string;
  args?: string;
  connect?: string;
  describe?: string;
  search?: string;
  regex?: boolean;
  includeSchemas?: boolean;
  server?: string;
  action?: string;
}
const formatMcpProxyArgs = (input: unknown): string => {
  const params =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as McpProxyParams)
      : {};
  if (params.tool) {
    let text = `call ${params.server ? `${params.server}/` : ""}${params.tool}`;
    if (params.args) {
      try {
        text += `\narguments:\n${JSON.stringify(JSON.parse(params.args), null, 2)}`;
      } catch {
        text += `\narguments:\n${params.args}`;
      }
    } else {
      text += `\narguments:\n{}`;
    }
    return text;
  }
  if (params.connect) {
    return `connect ${params.connect}`;
  }
  if (params.describe) {
    return `describe ${params.describe}`;
  }
  if (params.search) {
    return `search ${params.regex ? "(regex) " : ""}${params.search}`;
  }
  if (params.server) {
    return `list ${params.server}`;
  }
  if (params.action) {
    return `action ${params.action}`;
  }
  return "status";
};
const disposeMcpState = async (
  current: McpExtensionState | null,
  reason: string
): Promise<void> => {
  if (!current) {
    return;
  }
  if (current.uiServer) {
    current.uiServer.close(reason);
    current.uiServer = null;
  }
  flushMetadataCache(current);
  await current.lifecycle.gracefulShutdown();
  if (current.ui) {
    current.ui.setStatus("mcp", "");
  }
};
const mcpAdapter = (pi: ExtensionAPI) => {
  let state: McpExtensionState | null = null;
  let initPromise: Promise<McpExtensionState> | null = null;
  let initGeneration = 0;
  const cleanupCurrentState = async (reason: string): Promise<void> => {
    const current = state;
    state = null;
    initPromise = null;
    await McpOAuthCallback.stop().catch(() => null);
    await disposeMcpState(current, reason);
  };
  const earlyConfigPath = getConfigPathFromArgv();
  const earlyConfig = loadMcpConfig(earlyConfigPath);
  const earlyCache = loadMetadataCache();
  const prefix = earlyConfig.settings?.toolPrefix ?? "server";
  const envRaw = process.env.MCP_DIRECT_TOOLS;
  const directSpecs =
    envRaw === "__none__"
      ? []
      : resolveDirectTools(
          earlyConfig,
          earlyCache,
          prefix,
          envRaw
            ?.split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        );
  const getState = (): McpExtensionState | null => state;
  const getInitPromise = (): Promise<McpExtensionState> | null => initPromise;
  for (const spec of directSpecs) {
    pi.registerTool({
      description: spec.description || "(no description)",
      execute: createDirectToolExecutor(getState, getInitPromise, spec),
      label: `MCP: ${spec.originalName}`,
      name: spec.prefixedName,
      parameters: Type.Unsafe<Record<string, unknown>>(
        spec.inputSchema || { properties: {}, type: "object" }
      ),
      promptSnippet:
        truncateAtWord(spec.description, 100) ||
        `MCP tool from ${spec.serverName}`,
      renderCall: renderDirectToolCall(spec),
    });
  }
  const getPiTools = (): ToolInfo[] => pi.getAllTools();
  pi.registerFlag("mcp-config", {
    description: "Path to MCP config file",
    type: "string",
  });
  pi.on("session_start", async (event, ctx) => {
    initGeneration += 1;
    const generation = initGeneration;
    await cleanupCurrentState(`session_start:${event.reason}`);
    const promise = initializeMcp(pi, ctx);
    initPromise = promise;
    promise
      .then(async (s) => {
        if (generation !== initGeneration) {
          await disposeMcpState(s, "stale_init");
          return;
        }
        state = s;
        if (initPromise === promise) {
          initPromise = null;
        }
        updateStatusBar(s);
      })
      .catch((error) => {
        if (generation !== initGeneration) {
          return;
        }
        console.error("MCP initialization failed:", error);
        if (initPromise === promise) {
          initPromise = null;
        }
      });
  });
  pi.on("session_shutdown", async () => {
    initGeneration += 1;
    await cleanupCurrentState("session_shutdown");
  });
  pi.registerCommand("mcp", {
    description: "Show MCP server status",
    getArgumentCompletions: (inputPrefix: string) => {
      const config = state?.config ?? earlyConfig;
      const parts = inputPrefix.split(/\s+/u);
      if (parts.length <= 1) {
        const subcommands = [
          { label: "reconnect  (reconnect servers)", value: "reconnect" },
          { label: "tools  (list all tools)", value: "tools" },
          { label: "status  (show server status)", value: "status" },
        ];
        const filtered = inputPrefix
          ? subcommands.filter((i) => i.value.startsWith(inputPrefix))
          : subcommands;
        return filtered.length > 0 ? filtered : null;
      }
      // "/mcp reconnect ..." → complete server names
      if (parts[0] === "reconnect" && parts.length <= 2) {
        const partial = parts[1] ?? "";
        const servers = Object.keys(config.mcpServers);
        const items = servers.map((name) => ({
          label: name,
          value: `reconnect ${name}`,
        }));
        const filtered = partial
          ? items.filter((i) => i.label.startsWith(partial))
          : items;
        return filtered.length > 0 ? filtered : null;
      }
      return null;
    },
    handler: async (args, ctx) => {
      if (!state && initPromise) {
        try {
          state = await initPromise;
        } catch {
          if (ctx.hasUI) {
            ctx.ui.notify("MCP initialization failed", "error");
          }
          return;
        }
      }
      if (!state) {
        if (ctx.hasUI) {
          ctx.ui.notify("MCP not initialized", "error");
        }
        return;
      }
      const parts = args?.trim()?.split(/\s+/u) ?? [];
      const [subcommand = "", targetServer] = parts;
      if (subcommand === "reconnect") {
        await reconnectServers(state, ctx, targetServer);
        return;
      }
      if (subcommand === "tools") {
        await showTools(state, ctx);
        return;
      }
      await (ctx.hasUI
        ? openMcpPanel(state, pi, ctx, earlyConfigPath)
        : showStatus(state, ctx));
    },
  });
  pi.registerCommand("mcp-auth", {
    description:
      "Authenticate with an MCP server (OAuth). Use 'remove <server>' to clear credentials.",
    getArgumentCompletions: (inputPrefix: string) => {
      const config = state?.config ?? earlyConfig;
      const servers = Object.entries(config.mcpServers)
        .filter(([, def]) => def.auth === "oauth")
        .map(([name]) => name);
      const parts = inputPrefix.split(/\s+/u);
      // "/mcp-auth rem..." → complete "remove"
      if (parts.length <= 1) {
        const items = [
          ...servers.map((name) => ({
            label: `${name}  (authenticate)`,
            value: name,
          })),
          { label: "remove  (clear credentials)", value: "remove" },
        ];
        const filtered = inputPrefix
          ? items.filter((i) => i.value.startsWith(inputPrefix))
          : items;
        return filtered.length > 0 ? filtered : null;
      }
      // "/mcp-auth remove ..." → complete server names
      if (parts[0] === "remove" && parts.length <= 2) {
        const partial = parts[1] ?? "";
        // For remove, show all OAuth servers (even those without stored tokens)
        const items = servers.map((name) => ({
          label: name,
          value: `remove ${name}`,
        }));
        const filtered = partial
          ? items.filter((i) => i.label.startsWith(partial))
          : items;
        return filtered.length > 0 ? filtered : null;
      }
      return null;
    },
    handler: async (args, ctx) => {
      const parts = args?.trim().split(/\s+/u) ?? [];
      const [subcommand = "", serverName] = parts;
      if (!subcommand) {
        if (ctx.hasUI) {
          ctx.ui.notify(
            "Usage: /mcp-auth <server-name>\n       /mcp-auth remove <server-name>",
            "error"
          );
        }
        return;
      }
      if (!state && initPromise) {
        try {
          state = await initPromise;
        } catch {
          if (ctx.hasUI) {
            ctx.ui.notify("MCP initialization failed", "error");
          }
          return;
        }
      }
      if (!state) {
        if (ctx.hasUI) {
          ctx.ui.notify("MCP not initialized", "error");
        }
        return;
      }
      if (subcommand === "remove") {
        if (!serverName) {
          if (ctx.hasUI) {
            ctx.ui.notify("Usage: /mcp-auth remove <server-name>", "error");
          }
          return;
        }
        await removeAuth(serverName, ctx);
        return;
      }
      // Default: authenticate
      await authenticateServer(subcommand, state.config, ctx, state);
    },
  });
  pi.registerTool({
    description: buildProxyDescription(earlyConfig, earlyCache, directSpecs),
    async execute(
      _toolCallId,
      params: McpProxyParams,
      _signal,
      _onUpdate,
      _ctx
    ) {
      let parsedArgs: Record<string, unknown> | undefined;
      if (params.args) {
        try {
          parsedArgs = JSON.parse(params.args);
          if (
            typeof parsedArgs !== "object" ||
            parsedArgs === null ||
            Array.isArray(parsedArgs)
          ) {
            let gotType = typeof parsedArgs;
            if (Array.isArray(parsedArgs)) {
              gotType = "array";
            } else if (parsedArgs === null) {
              gotType = "null";
            }
            return {
              content: [
                {
                  text: `Invalid args: expected a JSON object, got ${gotType}`,
                  type: "text" as const,
                },
              ],
              details: { error: "invalid_args_type" },
              isError: true,
            };
          }
        } catch (error) {
          return {
            content: [
              {
                text: `Invalid args JSON: ${error instanceof Error ? error.message : error}`,
                type: "text" as const,
              },
            ],
            details: { error: "invalid_args" },
            isError: true,
          };
        }
      }
      if (!state && initPromise) {
        try {
          state = await initPromise;
        } catch {
          return {
            content: [
              { text: "MCP initialization failed", type: "text" as const },
            ],
            details: { error: "init_failed" },
          };
        }
      }
      if (!state) {
        return {
          content: [{ text: "MCP not initialized", type: "text" as const }],
          details: { error: "not_initialized" },
        };
      }
      if (params.action === "ui-messages") {
        return executeUiMessages(state);
      }
      if (params.tool) {
        return executeCall(state, params.tool, parsedArgs, params.server);
      }
      if (params.connect) {
        return executeConnect(state, params.connect);
      }
      if (params.describe) {
        return executeDescribe(state, params.describe);
      }
      if (params.search) {
        return executeSearch(
          state,
          params.search,
          params.regex,
          params.server,
          params.includeSchemas,
          getPiTools
        );
      }
      if (params.server) {
        return executeList(state, params.server);
      }
      return executeStatus(state);
    },
    label: "MCP",
    name: "mcp",
    parameters: Type.Object({
      action: Type.Optional(
        Type.String({
          description:
            "Action: 'ui-messages' to retrieve prompts/intents from UI sessions",
        })
      ),
      args: Type.Optional(
        Type.String({
          description: 'Arguments as JSON string (e.g., \'{"key": "value"}\')',
        })
      ),
      connect: Type.Optional(
        Type.String({
          description:
            "Server name to connect (lazy connect + metadata refresh)",
        })
      ),
      describe: Type.Optional(
        Type.String({ description: "Tool name to describe (shows parameters)" })
      ),
      includeSchemas: Type.Optional(
        Type.Boolean({
          description:
            "Include parameter schemas in search results (default: true)",
        })
      ),
      regex: Type.Optional(
        Type.Boolean({
          description: "Treat search as regex (default: substring match)",
        })
      ),
      search: Type.Optional(
        Type.String({ description: "Search tools by name/description" })
      ),
      server: Type.Optional(
        Type.String({
          description:
            "Filter to specific server (also disambiguates tool calls)",
        })
      ),
      tool: Type.Optional(
        Type.String({
          description: "Tool name to call (e.g., 'xcodebuild_list_sims')",
        })
      ),
    }),
    promptSnippet: "MCP gateway - connect to MCP servers and call their tools",
    renderCall(params, theme) {
      const text = `${theme.fg("toolTitle", theme.bold("mcp"))} ${theme.fg("muted", formatMcpProxyArgs(params))}`;
      return new Text(text, 0, 0);
    },
  });
};
export default mcpAdapter;
