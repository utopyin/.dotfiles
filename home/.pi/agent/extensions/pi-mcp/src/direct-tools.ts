import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { McpExtensionState } from "./state.js";
import type { DirectToolSpec, McpConfig, McpContent } from "./types.js";
import type { MetadataCache } from "./metadata-cache.js";
import { lazyConnect, getFailureAgeSeconds } from "./init.js";
import { isServerCacheValid } from "./metadata-cache.js";
import { formatSchema } from "./tool-metadata.js";
import { transformMcpContent } from "./tool-registrar.js";
import { maybeStartUiSession } from './ui-session.js';
import type { UiSessionRuntime } from './ui-session.js';
import { formatToolName } from "./types.js";
import { resourceNameToToolName } from "./resource-tools.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { Text } from "@earendil-works/pi-tui";

const BUILTIN_NAMES = new Set(["read", "bash", "edit", "write", "grep", "find", "ls", "mcp"]);
const formatArgs = (args: Record<string, unknown> | undefined): string => {
    if (!args || Object.keys(args).length === 0) {
        return "{}";
    }
    try {
        return JSON.stringify(args, null, 2);
    }
    catch {
        return String(args);
    }
};
export const renderDirectToolCall = (spec: DirectToolSpec): NonNullable<ToolDefinition["renderCall"]> => 
    (args, theme) => {
        const recordArgs = (args && typeof args === "object" && !Array.isArray(args)) ? args as Record<string, unknown> : undefined;
        let text = theme.fg("toolTitle", theme.bold(spec.prefixedName));
        text += theme.fg("muted", ` → ${spec.serverName}/${spec.originalName}`);
        text += spec.resourceUri
            ? `\n${theme.fg("muted", "resource:")} ${spec.resourceUri}`
            : `\n${theme.fg("muted", "arguments:")}\n${formatArgs(recordArgs)}`;
        return new Text(text, 0, 0);
    }
;
export const resolveDirectTools = (config: McpConfig, cache: MetadataCache | null, prefix: "server" | "none" | "short", envOverride?: string[]): DirectToolSpec[] => {
    const specs: DirectToolSpec[] = [];
    if (!cache) {
        return specs;
    }
    const seenNames = new Set<string>();
    const envServers = new Set<string>();
    const envTools = new Map<string, Set<string>>();
    if (envOverride) {
        for (let item of envOverride) {
            item = item.replace(/\/+$/u, "");
            if (item.includes("/")) {
                const [server, tool] = item.split("/", 2);
                if (server && tool) {
                    const toolsForServer = envTools.get(server) ?? new Set<string>();
                    toolsForServer.add(tool);
                    envTools.set(server, toolsForServer);
                }
                else if (server) {
                    envServers.add(server);
                }
            }
            else if (item) {
                envServers.add(item);
            }
        }
    }
    const globalDirect = config.settings?.directTools;
    for (const [serverName, definition] of Object.entries(config.mcpServers)) {
        const serverCache = cache.servers[serverName];
        if (!serverCache || !isServerCacheValid(serverCache, definition)) {
            continue;
        }
        let toolFilter: true | string[] | false = false;
        if (envOverride) {
            if (envServers.has(serverName)) {
                toolFilter = true;
            }
            else {
                const toolsForServer = envTools.get(serverName);
                if (toolsForServer) {
                    toolFilter = [...toolsForServer];
                }
            }
        }
        else if (definition.directTools !== undefined) {
            toolFilter = definition.directTools;
        }
        else if (globalDirect) {
            toolFilter = globalDirect;
        }
        if (!toolFilter) {
            continue;
        }
        for (const tool of serverCache.tools ?? []) {
            if (toolFilter !== true && !toolFilter.includes(tool.name)) {
                continue;
            }
            const prefixedName = formatToolName(tool.name, serverName, prefix);
            if (BUILTIN_NAMES.has(prefixedName)) {
                console.warn(`MCP: skipping direct tool "${prefixedName}" (collides with builtin)`);
                continue;
            }
            if (seenNames.has(prefixedName)) {
                console.warn(`MCP: skipping duplicate direct tool "${prefixedName}" from "${serverName}"`);
                continue;
            }
            seenNames.add(prefixedName);
            specs.push({
                description: tool.description ?? "",
                inputSchema: tool.inputSchema,
                originalName: tool.name,
                prefixedName,
                serverName,
                uiResourceUri: tool.uiResourceUri,
                uiStreamMode: tool.uiStreamMode,
            });
        }
        if (definition.exposeResources !== false) {
            for (const resource of serverCache.resources ?? []) {
                const baseName = `get_${resourceNameToToolName(resource.name)}`;
                if (toolFilter !== true && !toolFilter.includes(baseName)) {
                    continue;
                }
                const prefixedName = formatToolName(baseName, serverName, prefix);
                if (BUILTIN_NAMES.has(prefixedName)) {
                    console.warn(`MCP: skipping direct resource tool "${prefixedName}" (collides with builtin)`);
                    continue;
                }
                if (seenNames.has(prefixedName)) {
                    console.warn(`MCP: skipping duplicate direct resource tool "${prefixedName}" from "${serverName}"`);
                    continue;
                }
                seenNames.add(prefixedName);
                specs.push({
                    description: resource.description ?? `Read resource: ${resource.uri}`,
                    originalName: baseName,
                    prefixedName,
                    resourceUri: resource.uri,
                    serverName,
                });
            }
        }
    }
    return specs;
};
export const buildProxyDescription = (config: McpConfig, cache: MetadataCache | null, directSpecs: DirectToolSpec[]): string => {
    let desc = `MCP gateway - connect to MCP servers and call their tools.\n`;
    const directByServer = new Map<string, number>();
    for (const spec of directSpecs) {
        directByServer.set(spec.serverName, (directByServer.get(spec.serverName) ?? 0) + 1);
    }
    if (directByServer.size > 0) {
        const parts = [...directByServer.entries()].map(([server, count]) => `${server} (${count})`);
        desc += `\nDirect tools available (call as normal tools): ${parts.join(", ")}\n`;
    }
    const serverSummaries: string[] = [];
    for (const serverName of Object.keys(config.mcpServers)) {
        const entry = cache?.servers?.[serverName];
        const definition = config.mcpServers[serverName];
        const toolCount = entry?.tools?.length ?? 0;
        const resourceCount = definition?.exposeResources === false ? 0 : (entry?.resources?.length ?? 0);
        const totalItems = toolCount + resourceCount;
        if (totalItems === 0) {
            continue;
        }
        const directCount = directByServer.get(serverName) ?? 0;
        const proxyCount = totalItems - directCount;
        if (proxyCount > 0) {
            serverSummaries.push(`${serverName} (${proxyCount} tools)`);
        }
    }
    if (serverSummaries.length > 0) {
        desc += `\nServers: ${serverSummaries.join(", ")}\n`;
    }
    desc += `\nUsage:\n`;
    desc += `  mcp({ })                              → Show server status\n`;
    desc += `  mcp({ server: "name" })               → List tools from server\n`;
    desc += `  mcp({ search: "query" })              → Search for tools (MCP + pi, space-separated words OR'd)\n`;
    desc += `  mcp({ describe: "tool_name" })        → Show tool details and parameters\n`;
    desc += `  mcp({ connect: "server-name" })       → Connect to a server and refresh metadata\n`;
    desc += `  mcp({ tool: "name", args: '{"key": "value"}' })    → Call a tool (args is JSON string)\n`;
    desc += `  mcp({ action: "ui-messages" })        → Retrieve accumulated messages from completed UI sessions\n`;
    desc += `\nMode: tool (call) > connect > describe > search > server (list) > action > nothing (status)`;
    return desc;
};
type DirectToolExecute = ToolDefinition["execute"];
interface ResourceContent {
    blob?: string;
    mimeType?: string;
    text?: string;
}
const formatResourceContent = (content: ResourceContent): string => {
    if ("text" in content) {
        return content.text ?? "";
    }
    if ("blob" in content) {
        return `[Binary data: ${content.mimeType ?? "unknown"}]`;
    }
    return JSON.stringify(content);
};
export const createDirectToolExecutor = (getState: () => McpExtensionState | null, getInitPromise: () => Promise<McpExtensionState> | null, spec: DirectToolSpec): DirectToolExecute => 
    async function execute(_toolCallId, params) {
        const toolArgs = (params && typeof params === "object" && !Array.isArray(params)) ? params as Record<string, unknown> : {};
        let state = getState();
        const initPromise = getInitPromise();
        if (!state && initPromise) {
            try {
                state = await initPromise;
            }
            catch {
                return {
                    content: [{ text: "MCP initialization failed", type: "text" as const }],
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
        const connected = await lazyConnect(state, spec.serverName);
        if (!connected) {
            const failedAgo = getFailureAgeSeconds(state, spec.serverName);
            const failureSuffix = failedAgo === null ? "" : ` (failed ${failedAgo}s ago)`;
            return {
                content: [{ text: `MCP server "${spec.serverName}" not available${failureSuffix}`, type: "text" as const }],
                details: { error: "server_unavailable", server: spec.serverName },
            };
        }
        const connection = state.manager.getConnection(spec.serverName);
        if (!connection || connection.status !== "connected") {
            return {
                content: [{ text: `MCP server "${spec.serverName}" not connected`, type: "text" as const }],
                details: { error: "not_connected", server: spec.serverName },
            };
        }
        let uiSession: UiSessionRuntime | null = null;
        try {
            state.manager.touch(spec.serverName);
            state.manager.incrementInFlight(spec.serverName);
            if (spec.resourceUri) {
                const result = await connection.client.readResource({ uri: spec.resourceUri });
                const content = (result.contents ?? []).map(c => ({
                    text: formatResourceContent(c as ResourceContent),
                    type: "text" as const,
                }));
                return {
                    content: content.length > 0 ? content : [{ text: "(empty resource)", type: "text" as const }],
                    details: { resourceUri: spec.resourceUri, server: spec.serverName },
                };
            }
            const { uiResourceUri } = spec;
            uiSession = uiResourceUri
                ? await maybeStartUiSession(state, {
                    serverName: spec.serverName,
                    streamMode: spec.uiStreamMode,
                    toolArgs,
                    toolName: spec.originalName,
                    uiResourceUri,
                })
                : null;
            const resultPromise = connection.client.callTool({
                _meta: uiSession?.requestMeta,
                arguments: toolArgs,
                name: spec.originalName,
            });
            const result = await resultPromise;
            uiSession?.sendToolResult(result as unknown as CallToolResult);
            const mcpContent = (result.content ?? []) as McpContent[];
            const content = transformMcpContent(mcpContent);
            if (result.isError) {
                let errorText = content.filter(c => c.type === "text").map(c => (c as {
                    text: string;
                }).text).join("\n") || "Tool execution failed";
                if (spec.inputSchema) {
                    errorText += `\n\nExpected parameters:\n${formatSchema(spec.inputSchema)}`;
                }
                return {
                    content: [{ text: `Error: ${errorText}`, type: "text" as const }],
                    details: { error: "tool_error", server: spec.serverName },
                };
            }
            const resultText = content.filter(c => c.type === "text").map(c => (c as {
                text: string;
            }).text).join("\n") || "(empty result)";
            if (uiResourceUri) {
                const uiMessage = uiSession?.reused
                    ? "Updated the open UI."
                    : "📺 Interactive UI is now open in your browser. I'll respond to your prompts and intents as you interact with it.";
                return {
                    content: [{ text: `${resultText}\n\n${uiMessage}`, type: "text" as const }],
                    details: { server: spec.serverName, tool: spec.originalName, uiOpen: true },
                };
            }
            return {
                content: content.length > 0 ? content : [{ text: "(empty result)", type: "text" as const }],
                details: { server: spec.serverName, tool: spec.originalName },
            };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            uiSession?.sendToolCancelled(message);
            // Detect auth failures so the LLM gets an actionable error.
            // Use word-boundary patterns to avoid false positives from tool output.
            const isAuthFailure = error instanceof UnauthorizedError ||
                error?.constructor?.name === "UnauthorizedError" ||
                /\b401\s+Unauthorized\b/iu.test(message) ||
                /\bHTTP\s+401\b/iu.test(message) ||
                /\bOAuth\b/iu.test(message) ||
                /\brefresh.token\b/iu.test(message) ||
                /\baccess.token\b/iu.test(message);
            if (isAuthFailure && state.config.mcpServers[spec.serverName]?.auth === "oauth") {
                state.needsAuth.add(spec.serverName);
                await state.manager.close(spec.serverName).catch(() => null);
                return {
                    content: [{ text: `Authentication expired for "${spec.serverName}". Run /mcp-auth ${spec.serverName} to re-authenticate.`, type: "text" as const }],
                    details: { error: "auth_expired", server: spec.serverName },
                };
            }
            let errorText = `Failed to call tool: ${message}`;
            if (spec.inputSchema) {
                errorText += `\n\nExpected parameters:\n${formatSchema(spec.inputSchema)}`;
            }
            return {
                content: [{ text: errorText, type: "text" as const }],
                details: { error: "call_failed", server: spec.serverName },
            };
        }
        finally {
            if (uiSession?.reused) {
                uiSession.close();
            }
            state.manager.decrementInFlight(spec.serverName);
            state.manager.touch(spec.serverName);
        }
    }
;
