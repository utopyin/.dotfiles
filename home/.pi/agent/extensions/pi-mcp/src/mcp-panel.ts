import { matchesKey, truncateToWidth, visibleWidth, } from "@earendil-works/pi-tui";
import type { McpConfig, McpPanelCallbacks, McpPanelResult, ServerProvenance, } from "./types.js";
import { resourceNameToToolName } from "./resource-tools.js";
import type { CachedTool, MetadataCache, ServerCacheEntry, } from "./metadata-cache.js";

interface PanelTheme {
    border: string;
    title: string;
    selected: string;
    direct: string;
    needsAuth: string;
    placeholder: string;
    description: string;
    hint: string;
    confirm: string;
    cancel: string;
}
const DEFAULT_THEME: PanelTheme = {
    border: "2",
    cancel: "31",
    confirm: "32",
    description: "2",
    direct: "32",
    hint: "2",
    needsAuth: "33",
    placeholder: "2;3",
    selected: "36",
    title: "2",
};
const fg = (code: string, text: string): string => {
    if (!code) {
        return text;
    }
    return `\u001B[${code}m${text}\u001B[0m`;
};
const ansiBold = (text: string): string => `\u001B[1m${text}\u001B[22m`;
const ansiItalic = (text: string): string => `\u001B[3m${text}\u001B[23m`;
const ansiInverse = (text: string): string => `\u001B[7m${text}\u001B[27m`;
const RAINBOW_COLORS = [
    "38;2;178;129;214",
    "38;2;215;135;175",
    "38;2;254;188;56",
    "38;2;228;192;15",
    "38;2;137;210;129",
    "38;2;0;175;175",
    "38;2;23;143;185",
];
const rainbowProgress = (filled: number, total: number): string => {
    const dots: string[] = [];
    for (let i = 0; i < total; i += 1) {
        const color = RAINBOW_COLORS[i % RAINBOW_COLORS.length];
        dots.push(fg(color, i < filled ? "●" : "○"));
    }
    return dots.join(" ");
};
const fuzzyScore = (query: string, text: string): number => {
    const lq = query.toLowerCase();
    const lt = text.toLowerCase();
    if (lt.includes(lq)) {
        return 100 + (lq.length / lt.length) * 50;
    }
    let score = 0;
    let qi = 0;
    let consecutive = 0;
    for (let i = 0; i < lt.length && qi < lq.length; i += 1) {
        if (lt[i] === lq[qi]) {
            score += 10 + consecutive;
            consecutive += 5;
            qi += 1;
        }
        else {
            consecutive = 0;
        }
    }
    return qi === lq.length ? score : 0;
};
const estimateTokens = (tool: CachedTool): number => {
    const schemaLen = JSON.stringify(tool.inputSchema ?? {}).length;
    const descLen = tool.description?.length ?? 0;
    return Math.ceil((tool.name.length + descLen + schemaLen) / 4) + 10;
};
type ConnectionStatus = "connected" | "idle" | "failed" | "needs-auth" | "connecting";
interface ToolState {
    name: string;
    description: string;
    isDirect: boolean;
    wasDirect: boolean;
    estimatedTokens: number;
}
interface ServerState {
    name: string;
    expanded: boolean;
    source: "user" | "project" | "import";
    importKind?: string;
    connectionStatus: ConnectionStatus;
    tools: ToolState[];
    hasCachedData: boolean;
}
interface VisibleItem {
    type: "server" | "tool";
    serverIndex: number;
    toolIndex?: number;
}
class McpPanel {
    private servers: ServerState[] = [];
    private cursorIndex = 0;
    private nameQuery = "";
    private descSearchActive = false;
    private descQuery = "";
    private dirty = false;
    private confirmingDiscard = false;
    private discardSelected = 1;
    private importNotice: string | null = null;
    private inactivityTimeout: ReturnType<typeof setTimeout> | null = null;
    private visibleItems: VisibleItem[] = [];
    private callbacks: McpPanelCallbacks;
    private done: (result: McpPanelResult) => void;
    private tui: {
        requestRender(): void;
    };
    private t = DEFAULT_THEME;
    private static readonly MAX_VISIBLE = 12;
    private static readonly INACTIVITY_MS = 60_000;
    constructor(config: McpConfig, cache: MetadataCache | null, provenance: Map<string, ServerProvenance>, callbacks: McpPanelCallbacks, tui: {
        requestRender(): void;
    }, done: (result: McpPanelResult) => void) {
        this.callbacks = callbacks;
        this.done = done;
        this.tui = tui;
        for (const [serverName, definition] of Object.entries(config.mcpServers)) {
            const prov = provenance.get(serverName);
            const serverCache = cache?.servers?.[serverName];
            const globalDirect = config.settings?.directTools;
            let toolFilter: true | string[] | false = false;
            if (definition.directTools !== undefined) {
                toolFilter = definition.directTools;
            }
            else if (globalDirect) {
                toolFilter = globalDirect;
            }
            const tools: ToolState[] = [];
            if (serverCache) {
                for (const tool of serverCache.tools ?? []) {
                    const isDirect = toolFilter === true ||
                        (Array.isArray(toolFilter) && toolFilter.includes(tool.name));
                    tools.push({
                        description: tool.description ?? "",
                        estimatedTokens: estimateTokens(tool),
                        isDirect,
                        name: tool.name,
                        wasDirect: isDirect,
                    });
                }
                if (definition.exposeResources !== false) {
                    for (const resource of serverCache.resources ?? []) {
                        const baseName = `get_${resourceNameToToolName(resource.name)}`;
                        const isDirect = toolFilter === true ||
                            (Array.isArray(toolFilter) && toolFilter.includes(baseName));
                        const ct: CachedTool = {
                            description: resource.description,
                            name: baseName,
                        };
                        tools.push({
                            description: resource.description ?? `Read resource: ${resource.uri}`,
                            estimatedTokens: estimateTokens(ct),
                            isDirect,
                            name: baseName,
                            wasDirect: isDirect,
                        });
                    }
                }
            }
            const status = callbacks.getConnectionStatus(serverName);
            this.servers.push({
                connectionStatus: status,
                expanded: false,
                hasCachedData: !!serverCache,
                importKind: prov?.importKind,
                name: serverName,
                source: prov?.kind ?? "user",
                tools,
            });
        }
        this.rebuildVisibleItems();
        this.resetInactivityTimeout();
    }
    private resetInactivityTimeout(): void {
        if (this.inactivityTimeout) {
            clearTimeout(this.inactivityTimeout);
        }
        this.inactivityTimeout = setTimeout(() => {
            this.cleanup();
            this.done({ cancelled: true, changes: new Map() });
        }, McpPanel.INACTIVITY_MS);
    }
    private cleanup(): void {
        if (this.inactivityTimeout) {
            clearTimeout(this.inactivityTimeout);
            this.inactivityTimeout = null;
        }
    }
    private rebuildVisibleItems(): void {
        const query = this.descSearchActive ? this.descQuery : this.nameQuery;
        const mode = this.descSearchActive ? "desc" : "name";
        this.visibleItems = [];
        for (let si = 0; si < this.servers.length; si += 1) {
            const server = this.servers[si];
            this.visibleItems.push({ serverIndex: si, type: "server" });
            if (server.expanded || query) {
                for (let ti = 0; ti < server.tools.length; ti += 1) {
                    const tool = server.tools[ti];
                    if (query) {
                        const score = mode === "name"
                            ? Math.max(fuzzyScore(query, tool.name), fuzzyScore(query, server.name) * 0.6)
                            : fuzzyScore(query, tool.description);
                        if (score === 0) {
                            continue;
                        }
                    }
                    this.visibleItems.push({
                        serverIndex: si,
                        toolIndex: ti,
                        type: "tool",
                    });
                }
            }
        }
        if (query) {
            this.visibleItems = this.visibleItems.filter((item) => {
                if (item.type === "server") {
                    return this.visibleItems.some((other) => other.type === "tool" && other.serverIndex === item.serverIndex);
                }
                return true;
            });
        }
    }
    private updateDirty(): void {
        this.dirty = this.servers.some((s) => s.tools.some((t) => t.isDirect !== t.wasDirect));
    }
    private buildResult(): McpPanelResult {
        const changes = new Map<string, true | string[] | false>();
        for (const server of this.servers) {
            const changed = server.tools.some((t) => t.isDirect !== t.wasDirect);
            if (!changed) {
                continue;
            }
            const directTools = server.tools.filter((t) => t.isDirect);
            if (directTools.length === server.tools.length &&
                server.tools.length > 0) {
                changes.set(server.name, true);
            }
            else if (directTools.length === 0) {
                changes.set(server.name, false);
            }
            else {
                changes.set(server.name, directTools.map((t) => t.name));
            }
        }
        return { cancelled: false, changes };
    }
    handleInput(data: string): void {
        this.resetInactivityTimeout();
        this.importNotice = null;
        if (this.confirmingDiscard) {
            this.handleDiscardInput(data);
            return;
        }
        // Global shortcuts — always work, even during desc search
        if (matchesKey(data, "ctrl+c")) {
            this.cleanup();
            this.done({ cancelled: true, changes: new Map() });
            return;
        }
        if (matchesKey(data, "ctrl+s")) {
            this.cleanup();
            this.done(this.buildResult());
            return;
        }
        // Modal description search mode
        if (this.descSearchActive) {
            if (matchesKey(data, "escape") || matchesKey(data, "return")) {
                this.descSearchActive = false;
                this.descQuery = "";
                this.rebuildVisibleItems();
                this.cursorIndex = Math.min(this.cursorIndex, Math.max(0, this.visibleItems.length - 1));
                return;
            }
            if (matchesKey(data, "backspace")) {
                if (this.descQuery.length > 0) {
                    this.descQuery = this.descQuery.slice(0, -1);
                    this.rebuildVisibleItems();
                    this.cursorIndex = Math.min(this.cursorIndex, Math.max(0, this.visibleItems.length - 1));
                }
                return;
            }
            if (matchesKey(data, "up")) {
                this.moveCursor(-1);
                return;
            }
            if (matchesKey(data, "down")) {
                this.moveCursor(1);
                return;
            }
            if (matchesKey(data, "space")) {
                // Toggle even while in desc search
                const item = this.visibleItems[this.cursorIndex];
                if (item) {
                    this.toggleItem(item);
                }
                return;
            }
            if (data.length === 1 && data.codePointAt(0) >= 32) {
                this.descQuery += data;
                this.rebuildVisibleItems();
                this.cursorIndex = Math.min(this.cursorIndex, Math.max(0, this.visibleItems.length - 1));
                return;
            }
            return;
        }
        if (matchesKey(data, "escape")) {
            if (this.nameQuery) {
                this.nameQuery = "";
                this.rebuildVisibleItems();
                this.cursorIndex = Math.min(this.cursorIndex, Math.max(0, this.visibleItems.length - 1));
                return;
            }
            if (this.dirty) {
                this.confirmingDiscard = true;
                this.discardSelected = 1;
                return;
            }
            this.cleanup();
            this.done({ cancelled: true, changes: new Map() });
            return;
        }
        if (matchesKey(data, "up")) {
            this.moveCursor(-1);
            return;
        }
        if (matchesKey(data, "down")) {
            this.moveCursor(1);
            return;
        }
        if (matchesKey(data, "space")) {
            const item = this.visibleItems[this.cursorIndex];
            if (item) {
                this.toggleItem(item);
            }
            return;
        }
        if (matchesKey(data, "return")) {
            const item = this.visibleItems[this.cursorIndex];
            if (!item) {
                return;
            }
            const server = this.servers[item.serverIndex];
            if (item.type === "server") {
                if (server.connectionStatus === "needs-auth") {
                    this.cleanup();
                    this.done({
                        authServer: server.name,
                        cancelled: false,
                        changes: new Map(),
                    });
                    return;
                }
                server.expanded = !server.expanded;
                this.rebuildVisibleItems();
                this.cursorIndex = Math.min(this.cursorIndex, Math.max(0, this.visibleItems.length - 1));
            }
            else if (item.toolIndex !== undefined) {
                const tool = server.tools[item.toolIndex];
                tool.isDirect = !tool.isDirect;
                if (tool.isDirect && server.source === "import") {
                    this.importNotice = `Imported from ${server.importKind ?? "external"} — will copy to user config on save`;
                }
                this.updateDirty();
            }
            return;
        }
        if (matchesKey(data, "ctrl+r")) {
            const item = this.visibleItems[this.cursorIndex];
            if (!item) {
                return;
            }
            const server = this.servers[item.serverIndex];
            if (server.connectionStatus === "connecting") {
                return;
            }
            server.connectionStatus = "connecting";
            void this.reconnectServer(server);
            return;
        }
        if (data === "?") {
            this.descSearchActive = true;
            this.descQuery = "";
            this.rebuildVisibleItems();
            this.cursorIndex = Math.min(this.cursorIndex, Math.max(0, this.visibleItems.length - 1));
            return;
        }
        // Backspace removes from name query
        if (matchesKey(data, "backspace")) {
            if (this.nameQuery.length > 0) {
                this.nameQuery = this.nameQuery.slice(0, -1);
                this.rebuildVisibleItems();
                this.cursorIndex = Math.min(this.cursorIndex, Math.max(0, this.visibleItems.length - 1));
            }
            return;
        }
        // All other printable chars → always-on name search
        if (data.length === 1 && data.codePointAt(0) >= 32) {
            this.nameQuery += data;
            this.rebuildVisibleItems();
            this.cursorIndex = Math.min(this.cursorIndex, Math.max(0, this.visibleItems.length - 1));
        }
    }
    private async reconnectServer(server: ServerState): Promise<void> {
        try {
            await this.callbacks.reconnect(server.name);
            server.connectionStatus = this.callbacks.getConnectionStatus(server.name);
            if (server.connectionStatus === "connected") {
                const entry = this.callbacks.refreshCacheAfterReconnect(server.name);
                if (entry) {
                    this.rebuildServerTools(server, entry);
                }
                server.hasCachedData = true;
            }
        }
        catch {
            server.connectionStatus = "failed";
        }
        this.tui.requestRender();
    }
    private toggleItem(item: VisibleItem): void {
        const server = this.servers[item.serverIndex];
        if (item.type === "server") {
            const newState = !server.tools.every((t) => t.isDirect);
            if (server.source === "import" && newState) {
                this.importNotice = `Imported from ${server.importKind ?? "external"} — will copy to user config on save`;
            }
            for (const t of server.tools) {
                t.isDirect = newState;
            }
        }
        else if (item.toolIndex !== undefined) {
            const tool = server.tools[item.toolIndex];
            tool.isDirect = !tool.isDirect;
            if (tool.isDirect && server.source === "import") {
                this.importNotice = `Imported from ${server.importKind ?? "external"} — will copy to user config on save`;
            }
        }
        this.updateDirty();
    }
    private handleDiscardInput(data: string): void {
        if (matchesKey(data, "ctrl+c")) {
            this.cleanup();
            this.done({ cancelled: true, changes: new Map() });
            return;
        }
        if (matchesKey(data, "escape") || data === "n" || data === "N") {
            this.confirmingDiscard = false;
            return;
        }
        if (matchesKey(data, "return")) {
            if (this.discardSelected === 0) {
                this.cleanup();
                this.done({ cancelled: true, changes: new Map() });
            }
            else {
                this.confirmingDiscard = false;
            }
            return;
        }
        if (data === "y" || data === "Y") {
            this.cleanup();
            this.done({ cancelled: true, changes: new Map() });
            return;
        }
        if (matchesKey(data, "left") ||
            matchesKey(data, "right") ||
            matchesKey(data, "tab")) {
            this.discardSelected = this.discardSelected === 0 ? 1 : 0;
        }
    }
    private moveCursor(delta: number): void {
        if (this.visibleItems.length === 0) {
            return;
        }
        this.cursorIndex = Math.max(0, Math.min(this.visibleItems.length - 1, this.cursorIndex + delta));
    }
    private rebuildServerTools(server: ServerState, entry: ServerCacheEntry): void {
        const existingState = new Map<string, boolean>();
        for (const t of server.tools) {
            existingState.set(t.name, t.isDirect);
        }
        const newTools: ToolState[] = [];
        for (const tool of entry.tools ?? []) {
            const prev = existingState.get(tool.name);
            const isDirect = prev ?? false;
            const wasDirect = server.tools.find((serverTool) => serverTool.name === tool.name)?.wasDirect ?? false;
            newTools.push({
                description: tool.description ?? "",
                estimatedTokens: estimateTokens(tool),
                isDirect,
                name: tool.name,
                wasDirect: prev === undefined ? false : wasDirect,
            });
        }
        for (const resource of entry.resources ?? []) {
            const baseName = `get_${resourceNameToToolName(resource.name)}`;
            const prev = existingState.get(baseName);
            const isDirect = prev ?? false;
            const wasDirect = server.tools.find((serverTool) => serverTool.name === baseName)?.wasDirect ?? false;
            const ct: CachedTool = {
                description: resource.description,
                name: baseName,
            };
            newTools.push({
                description: resource.description ?? `Read resource: ${resource.uri}`,
                estimatedTokens: estimateTokens(ct),
                isDirect,
                name: baseName,
                wasDirect: prev === undefined ? false : wasDirect,
            });
        }
        server.tools = newTools;
        this.rebuildVisibleItems();
        this.updateDirty();
    }
    render(width: number): string[] {
        const innerW = width - 2;
        const lines: string[] = [];
        const { t } = this;
        const row = (content: string) => fg(t.border, "│") +
            truncateToWidth(" " + content, innerW, "…", true) +
            fg(t.border, "│");
        const emptyRow = () => fg(t.border, "│") + " ".repeat(innerW) + fg(t.border, "│");
        const divider = () => fg(t.border, `├${"─".repeat(innerW)}┤`);
        const titleText = " MCP Servers ";
        const borderLen = innerW - visibleWidth(titleText);
        const leftB = Math.floor(borderLen / 2);
        const rightB = borderLen - leftB;
        lines.push(fg(t.border, "╭" + "─".repeat(leftB)) +
            fg(t.title, titleText) +
            fg(t.border, "─".repeat(rightB) + "╮"));
        lines.push(emptyRow());
        const cursor = fg(t.selected, "│");
        const searchIcon = fg(t.border, "◎");
        if (this.descSearchActive) {
            lines.push(row(`${searchIcon}  ${fg(t.needsAuth, "desc:")} ${this.descQuery}${cursor}`));
        }
        else if (this.nameQuery) {
            lines.push(row(`${searchIcon}  ${this.nameQuery}${cursor}`));
        }
        else {
            lines.push(row(`${searchIcon}  ${fg(t.placeholder, ansiItalic("search..."))}`));
        }
        lines.push(emptyRow());
        lines.push(divider());
        if (this.servers.length === 0) {
            lines.push(emptyRow());
            lines.push(row(fg(t.hint, ansiItalic("No MCP servers configured."))));
            lines.push(emptyRow());
        }
        else {
            const maxVis = McpPanel.MAX_VISIBLE;
            const total = this.visibleItems.length;
            const startIdx = Math.max(0, Math.min(this.cursorIndex - Math.floor(maxVis / 2), total - maxVis));
            const endIdx = Math.min(startIdx + maxVis, total);
            lines.push(emptyRow());
            for (let i = startIdx; i < endIdx; i += 1) {
                const item = this.visibleItems[i];
                const isCursor = i === this.cursorIndex;
                const server = this.servers[item.serverIndex];
                if (item.type === "server") {
                    lines.push(row(this.renderServerRow(server, isCursor)));
                }
                else if (item.toolIndex !== undefined) {
                    lines.push(row(this.renderToolRow(server.tools[item.toolIndex], isCursor, innerW)));
                }
            }
            lines.push(emptyRow());
            if (total > maxVis) {
                const prog = Math.round(((this.cursorIndex + 1) / total) * 10);
                lines.push(row(`${rainbowProgress(prog, 10)}  ${fg(t.hint, `${this.cursorIndex + 1}/${total}`)}`));
                lines.push(emptyRow());
            }
            if (this.importNotice) {
                lines.push(row(fg(t.needsAuth, ansiItalic(this.importNotice))));
                lines.push(emptyRow());
            }
        }
        lines.push(divider());
        lines.push(emptyRow());
        if (this.confirmingDiscard) {
            const discardBtn = this.discardSelected === 0
                ? ansiInverse(ansiBold(fg(t.cancel, "  Discard  ")))
                : fg(t.hint, "  Discard  ");
            const keepBtn = this.discardSelected === 1
                ? ansiInverse(ansiBold(fg(t.confirm, "  Keep  ")))
                : fg(t.hint, "  Keep  ");
            lines.push(row(`Discard unsaved changes?  ${discardBtn}   ${keepBtn}`));
        }
        else {
            const directCount = this.servers.reduce((sum, server) => sum + server.tools.filter((tool) => tool.isDirect).length, 0);
            const totalTokens = this.servers.reduce((sum, server) => sum +
                server.tools
                    .filter((tool) => tool.isDirect)
                    .reduce((tokenSum, tool) => tokenSum + tool.estimatedTokens, 0), 0);
            const stats = directCount > 0
                ? `${directCount} direct  ~${totalTokens.toLocaleString()} tokens`
                : "no direct tools";
            lines.push(row(fg(t.description, stats + (this.dirty ? fg(t.needsAuth, "  (unsaved)") : ""))));
        }
        lines.push(emptyRow());
        const hints = [
            `${ansiItalic("↑↓")} navigate`,
            `${ansiItalic("space")} toggle`,
            `${ansiItalic("⏎")} expand`,
            `${ansiItalic("ctrl+r")} reconnect`,
            `${ansiItalic("?")} desc search`,
            `${ansiItalic("ctrl+s")} save`,
            `${ansiItalic("esc")} clear/close`,
            `${ansiItalic("ctrl+c")} quit`,
        ];
        const gap = "  ";
        const gapW = 2;
        const maxW = innerW - 2;
        let curLine = "";
        let curW = 0;
        for (const hint of hints) {
            const hw = visibleWidth(hint);
            const needed = curW === 0 ? hw : gapW + hw;
            if (curW > 0 && curW + needed > maxW) {
                lines.push(row(fg(t.hint, curLine)));
                curLine = hint;
                curW = hw;
            }
            else {
                curLine += (curW > 0 ? gap : "") + hint;
                curW += needed;
            }
        }
        if (curLine) {
            lines.push(row(fg(t.hint, curLine)));
        }
        lines.push(fg(t.border, `╰${"─".repeat(innerW)}╯`));
        return lines;
    }
    private renderServerRow(server: ServerState, isCursor: boolean): string {
        const { t } = this;
        const expandIcon = server.expanded ? "▾" : "▸";
        const prefix = isCursor
            ? fg(t.selected, expandIcon)
            : fg(t.border, server.expanded ? expandIcon : "·");
        const nameStr = isCursor ? ansiBold(fg(t.selected, server.name)) : server.name;
        const importLabel = server.source === "import"
            ? fg(t.description, ` (${server.importKind ?? "import"})`)
            : "";
        // Show auth status for servers that need authentication
        if (server.connectionStatus === "needs-auth") {
            return `${prefix} 🔑 ${nameStr}${importLabel}  ${fg(t.needsAuth, `needs auth — /mcp-auth ${server.name}`)}`;
        }
        if (!server.hasCachedData) {
            return `${prefix}   ${nameStr}${importLabel}  ${fg(t.description, "(not cached)")}`;
        }
        const directCount = server.tools.filter((tool) => tool.isDirect).length;
        const totalCount = server.tools.length;
        let toggleIcon = fg(t.description, "○");
        if (directCount === totalCount && totalCount > 0) {
            toggleIcon = fg(t.direct, "●");
        }
        else if (directCount > 0) {
            toggleIcon = fg(t.needsAuth, "◐");
        }
        let toolInfo = "";
        if (totalCount > 0) {
            toolInfo = `${directCount}/${totalCount}`;
            if (directCount > 0) {
                const tokens = server.tools
                    .filter((tool) => tool.isDirect)
                    .reduce((sum, tool) => sum + tool.estimatedTokens, 0);
                toolInfo += `  ~${tokens.toLocaleString()}`;
            }
            toolInfo = fg(t.description, toolInfo);
        }
        return `${prefix} ${toggleIcon} ${nameStr}${importLabel}  ${toolInfo}`;
    }
    private renderToolRow(tool: ToolState, isCursor: boolean, innerW: number): string {
        const { t } = this;
        const toggleIcon = tool.isDirect
            ? fg(t.direct, "●")
            : fg(t.description, "○");
        const cursor = isCursor ? fg(t.selected, "▸") : " ";
        const nameStr = isCursor ? ansiBold(fg(t.selected, tool.name)) : tool.name;
        const prefixLen = 7 + visibleWidth(tool.name);
        const maxDescLen = Math.max(0, innerW - prefixLen - 8);
        const descStr = maxDescLen > 5 && tool.description
            ? fg(t.description, `— ${truncateToWidth(tool.description, maxDescLen, "…")}`)
            : "";
        return `  ${cursor} ${toggleIcon} ${nameStr} ${descStr}`;
    }
    invalidate(): void {
        void this.tui;
    }
    dispose(): void {
        this.cleanup();
    }
}
export const createMcpPanel = (config: McpConfig, cache: MetadataCache | null, provenance: Map<string, ServerProvenance>, callbacks: McpPanelCallbacks, tui: {
    requestRender(): void;
}, done: (result: McpPanelResult) => void): McpPanel & {
    dispose(): void;
} => 
    new McpPanel(config, cache, provenance, callbacks, tui, done)
;
