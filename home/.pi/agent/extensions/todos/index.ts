/**
 * This extension stores todo items as files under <todo-dir> (defaults to .pi/todos,
 * or the path in PI_TODO_PATH).  Each todo is a standalone markdown file named
 * <id>.md and an optional <id>.lock file is used while a session is editing it.
 *
 * File format in .pi/todos:
 * - The file starts with a JSON object (not YAML) containing the front matter:
 *   { id, title, tags, status, created_at, assigned_to_session }
 * - After the JSON block comes optional markdown body text separated by a blank line.
 * - Example:
 *   {
 *     "id": "deadbeef",
 *     "title": "Add tests",
 *     "tags": ["qa"],
 *     "status": "open",
 *     "created_at": "2026-01-25T17:00:00.000Z",
 *     "assigned_to_session": "session.json"
 *   }
 *
 *   Notes about the work go here.
 *
 * Todo storage settings are kept in <todo-dir>/settings.json.
 * Defaults:
 * {
 *   "gc": true,   // delete closed todos older than gcDays on startup
 *   "gcDays": 7   // age threshold for GC (days since created_at)
 * }
 *
 * Use `/todos` to bring up the visual todo manager or just let the LLM use them
 * naturally.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import {
	copyToClipboard,
	DynamicBorder,
	getMarkdownTheme,
	keyHint,
} from "@earendil-works/pi-coding-agent";
import type {
	ExtensionAPI,
	ExtensionContext,
	KeybindingsManager,
	Theme,
} from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import {
	Container,
	fuzzyMatch,
	Input,
	Key,
	Markdown,
	matchesKey,
	SelectList,
	Spacer,
	Text,
	truncateToWidth,
	visibleWidth,
} from "@earendil-works/pi-tui";
import type { Focusable, SelectItem, TUI } from "@earendil-works/pi-tui";
import { Type } from "typebox";

const TODO_DIR_NAME = ".pi/todos";
const TODO_PATH_ENV = "PI_TODO_PATH";
const TODO_SETTINGS_NAME = "settings.json";
const TODO_ID_PREFIX = "TODO-";
const TODO_ID_PATTERN = /^[a-f0-9]{8}$/iu;
const DEFAULT_TODO_SETTINGS = {
    gc: true,
    gcDays: 7,
};
const LOCK_TTL_MS = 30 * 60 * 1000;
interface TodoFrontMatter {
    id: string;
    title: string;
    tags: string[];
    status: string;
    created_at: string;
    assigned_to_session?: string;
}
interface TodoRecord extends TodoFrontMatter {
    body: string;
}
interface LockInfo {
    id: string;
    pid: number;
    session?: string | null;
    created_at: string;
}
interface TodoSettings {
    gc: boolean;
    gcDays: number;
}
const TodoParams = Type.Object({
    action: StringEnum([
        "list",
        "list-all",
        "get",
        "create",
        "update",
        "append",
        "delete",
        "claim",
        "release",
    ] as const),
    body: Type.Optional(Type.String({ description: "Long-form details (markdown). Update replaces; append adds." })),
    force: Type.Optional(Type.Boolean({ description: "Override another session's assignment" })),
    id: Type.Optional(Type.String({ description: "Todo id (TODO-<hex> or raw hex filename)" })),
    status: Type.Optional(Type.String({ description: "Todo status" })),
    tags: Type.Optional(Type.Array(Type.String({ description: "Todo tag" }))),
    title: Type.Optional(Type.String({ description: "Short summary shown in lists" })),
});
type TodoAction = "list" | "list-all" | "get" | "create" | "update" | "append" | "delete" | "claim" | "release";
type TodoOverlayAction = "back" | "work";
type TodoMenuAction = "work" | "refine" | "close" | "reopen" | "release" | "delete" | "copyPath" | "copyText" | "view";
type TodoToolDetails = {
    action: "list" | "list-all";
    todos: TodoFrontMatter[];
    currentSessionId?: string;
    error?: string;
} | {
    action: "get" | "create" | "update" | "append" | "delete" | "claim" | "release";
    todo: TodoRecord;
    error?: string;
};
const formatTodoId = (id: string): string => 
    `${TODO_ID_PREFIX}${id}`
;
const normalizeTodoId = (id: string): string => {
    let trimmed = id.trim();
    if (trimmed.startsWith("#")) {
        trimmed = trimmed.slice(1);
    }
    if (trimmed.toUpperCase().startsWith(TODO_ID_PREFIX)) {
        trimmed = trimmed.slice(TODO_ID_PREFIX.length);
    }
    return trimmed;
};
const validateTodoId = (id: string): {
    id: string;
} | {
    error: string;
} => {
    const normalized = normalizeTodoId(id);
    if (!normalized || !TODO_ID_PATTERN.test(normalized)) {
        return { error: "Invalid todo id. Expected TODO-<hex>." };
    }
    return { id: normalized.toLowerCase() };
};
const displayTodoId = (id: string): string => 
    formatTodoId(normalizeTodoId(id))
;
const isTodoClosed = (status: string): boolean => 
    ["closed", "done"].includes(status.toLowerCase())
;
const clearAssignmentIfClosed = (todo: TodoFrontMatter): void => {
    if (isTodoClosed(getTodoStatus(todo))) {
        todo.assigned_to_session = undefined;
    }
};
const sortTodos = (todos: TodoFrontMatter[]): TodoFrontMatter[] => 
    [...todos].toSorted((a, b) => {
        const aClosed = isTodoClosed(a.status);
        const bClosed = isTodoClosed(b.status);
        if (aClosed !== bClosed) {
            return aClosed ? 1 : -1;
        }
        const aAssigned = !aClosed && Boolean(a.assigned_to_session);
        const bAssigned = !bClosed && Boolean(b.assigned_to_session);
        if (aAssigned !== bAssigned) {
            return aAssigned ? -1 : 1;
        }
        return (a.created_at || "").localeCompare(b.created_at || "");
    })
;
const buildTodoSearchText = (todo: TodoFrontMatter): string => {
    const tags = todo.tags.join(" ");
    const assignment = todo.assigned_to_session ? `assigned:${todo.assigned_to_session}` : "";
    return `${formatTodoId(todo.id)} ${todo.id} ${todo.title} ${tags} ${todo.status} ${assignment}`.trim();
};
const filterTodos = (todos: TodoFrontMatter[], query: string): TodoFrontMatter[] => {
    const trimmed = query.trim();
    if (!trimmed) {
        return todos;
    }
    const tokens = trimmed
        .split(/\s+/u)
        .map((token) => token.trim())
        .filter(Boolean);
    if (tokens.length === 0) {
        return todos;
    }
    const matches: {
        todo: TodoFrontMatter;
        score: number;
    }[] = [];
    for (const todo of todos) {
        const text = buildTodoSearchText(todo);
        let totalScore = 0;
        let matched = true;
        for (const token of tokens) {
            const result = fuzzyMatch(token, text);
            if (!result.matches) {
                matched = false;
                break;
            }
            totalScore += result.score;
        }
        if (matched) {
            matches.push({ score: totalScore, todo });
        }
    }
    return matches
        .toSorted((a, b) => {
        const aClosed = isTodoClosed(a.todo.status);
        const bClosed = isTodoClosed(b.todo.status);
        if (aClosed !== bClosed) {
            return aClosed ? 1 : -1;
        }
        const aAssigned = !aClosed && Boolean(a.todo.assigned_to_session);
        const bAssigned = !bClosed && Boolean(b.todo.assigned_to_session);
        if (aAssigned !== bAssigned) {
            return aAssigned ? -1 : 1;
        }
        return a.score - b.score;
    })
        .map((match) => match.todo);
};
const getTodoListTitleColor = (isSelected: boolean, closed: boolean): "accent" | "dim" | "text" => {
    if (isSelected) {
        return "accent";
    }
    return closed ? "dim" : "text";
};
class TodoSelectorComponent extends Container implements Focusable {
    private searchInput: Input;
    private listContainer: Container;
    private allTodos: TodoFrontMatter[];
    private filteredTodos: TodoFrontMatter[];
    private selectedIndex = 0;
    private onSelectCallback: (todo: TodoFrontMatter) => void;
    private onCancelCallback: () => void;
    private tui: TUI;
    private theme: Theme;
    private headerText: Text;
    private hintText: Text;
    private currentSessionId?: string;
    private keybindings?: KeybindingsManager;
    private onQuickAction?: (todo: TodoFrontMatter, action: "work" | "refine") => void;
    private _focused = false;
    get focused(): boolean {
        return this._focused;
    }
    set focused(value: boolean) {
        this._focused = value;
        this.searchInput.focused = value;
    }
    constructor(tui: TUI, theme: Theme, todos: TodoFrontMatter[], onSelect: (todo: TodoFrontMatter) => void, onCancel: () => void, initialSearchInput?: string, currentSessionId?: string, keybindings?: KeybindingsManager, onQuickAction?: (todo: TodoFrontMatter, action: "work" | "refine") => void) {
        super();
        this.tui = tui;
        this.theme = theme;
        this.currentSessionId = currentSessionId;
        this.keybindings = keybindings;
        this.onQuickAction = onQuickAction;
        this.allTodos = todos;
        this.filteredTodos = todos;
        this.onSelectCallback = onSelect;
        this.onCancelCallback = onCancel;
        this.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
        this.addChild(new Spacer(1));
        this.headerText = new Text("", 1, 0);
        this.addChild(this.headerText);
        this.addChild(new Spacer(1));
        this.searchInput = new Input();
        if (initialSearchInput) {
            this.searchInput.setValue(initialSearchInput);
        }
        this.searchInput.onSubmit = () => {
            const selected = this.filteredTodos[this.selectedIndex];
            if (selected) {
                this.onSelectCallback(selected);
            }
        };
        this.addChild(this.searchInput);
        this.addChild(new Spacer(1));
        this.listContainer = new Container();
        this.addChild(this.listContainer);
        this.addChild(new Spacer(1));
        this.hintText = new Text("", 1, 0);
        this.addChild(this.hintText);
        this.addChild(new Spacer(1));
        this.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
        this.updateHeader();
        this.updateHints();
        this.applyFilter(this.searchInput.getValue());
    }
    setTodos(todos: TodoFrontMatter[]): void {
        this.allTodos = todos;
        this.updateHeader();
        this.applyFilter(this.searchInput.getValue());
        this.tui.requestRender();
    }
    getSearchValue(): string {
        return this.searchInput.getValue();
    }
    private updateHeader(): void {
        const openCount = this.allTodos.filter((todo) => !isTodoClosed(todo.status)).length;
        const closedCount = this.allTodos.length - openCount;
        const title = `Todos (${openCount} open, ${closedCount} closed)`;
        this.headerText.setText(this.theme.fg("accent", this.theme.bold(title)));
    }
    private updateHints(): void {
        this.hintText.setText(this.theme.fg("dim", "Type to search • ↑↓ select • Enter actions • Ctrl+Shift+W work • Ctrl+Shift+R refine • Esc close"));
    }
    private applyFilter(query: string): void {
        this.filteredTodos = filterTodos(this.allTodos, query);
        this.selectedIndex = Math.min(this.selectedIndex, Math.max(0, this.filteredTodos.length - 1));
        this.updateList();
    }
    private updateList(): void {
        this.listContainer.clear();
        if (this.filteredTodos.length === 0) {
            this.listContainer.addChild(new Text(this.theme.fg("muted", "  No matching todos"), 0, 0));
            return;
        }
        const maxVisible = 10;
        const startIndex = Math.max(0, Math.min(this.selectedIndex - Math.floor(maxVisible / 2), this.filteredTodos.length - maxVisible));
        const endIndex = Math.min(startIndex + maxVisible, this.filteredTodos.length);
        for (let i = startIndex; i < endIndex; i += 1) {
            const todo = this.filteredTodos[i];
            if (!todo) {
                continue;
            }
            const isSelected = i === this.selectedIndex;
            const closed = isTodoClosed(todo.status);
            const prefix = isSelected ? this.theme.fg("accent", "→ ") : "  ";
            const titleColor = getTodoListTitleColor(isSelected, closed);
            const statusColor = closed ? "dim" : "success";
            const tagText = todo.tags.length ? ` [${todo.tags.join(", ")}]` : "";
            const assignmentText = renderAssignmentSuffix(this.theme, todo, this.currentSessionId);
            const line = `${prefix +
                this.theme.fg("accent", formatTodoId(todo.id))} ${this.theme.fg(titleColor, todo.title || "(untitled)")}${this.theme.fg("muted", tagText)}${assignmentText} ${this.theme.fg(statusColor, `(${todo.status || "open"})`)}`;
            this.listContainer.addChild(new Text(line, 0, 0));
        }
        if (startIndex > 0 || endIndex < this.filteredTodos.length) {
            const scrollInfo = this.theme.fg("dim", `  (${this.selectedIndex + 1}/${this.filteredTodos.length})`);
            this.listContainer.addChild(new Text(scrollInfo, 0, 0));
        }
    }
    handleInput(keyData: string): void {
        const kb = this.keybindings;
        if (this.handleSelectionNavigation(keyData, kb)) {
            return;
        }
        if (this.handleSelectionAction(keyData, kb)) {
            return;
        }
        if (this.handleQuickAction(keyData)) {
            return;
        }
        this.searchInput.handleInput(keyData);
        this.applyFilter(this.searchInput.getValue());
    }
    private handleSelectionNavigation(keyData: string, kb?: KeybindingsManager): boolean {
        if (kb?.matches(keyData, "tui.select.up") || matchesKey(keyData, "up")) {
            this.moveSelection(-1);
            return true;
        }
        if (kb?.matches(keyData, "tui.select.down") || matchesKey(keyData, "down")) {
            this.moveSelection(1);
            return true;
        }
        return false;
    }
    private handleSelectionAction(keyData: string, kb?: KeybindingsManager): boolean {
        if (kb?.matches(keyData, "tui.select.confirm") || matchesKey(keyData, "enter")) {
            const selected = this.filteredTodos[this.selectedIndex];
            if (selected) {
                this.onSelectCallback(selected);
            }
            return true;
        }
        if (kb?.matches(keyData, "tui.select.cancel") || matchesKey(keyData, "escape")) {
            this.onCancelCallback();
            return true;
        }
        return false;
    }
    private handleQuickAction(keyData: string): boolean {
        if (matchesKey(keyData, Key.ctrlShift("r"))) {
            this.runQuickAction("refine");
            return true;
        }
        if (matchesKey(keyData, Key.ctrlShift("w"))) {
            this.runQuickAction("work");
            return true;
        }
        return false;
    }
    private moveSelection(delta: -1 | 1): void {
        if (this.filteredTodos.length === 0) {
            return;
        }
        const lastIndex = this.filteredTodos.length - 1;
        if (delta < 0) {
            this.selectedIndex = this.selectedIndex === 0 ? lastIndex : this.selectedIndex - 1;
        } else {
            this.selectedIndex = this.selectedIndex === lastIndex ? 0 : this.selectedIndex + 1;
        }
        this.updateList();
    }
    private runQuickAction(action: "work" | "refine"): void {
        const selected = this.filteredTodos[this.selectedIndex];
        if (selected && this.onQuickAction) {
            this.onQuickAction(selected, action);
        }
    }
    override invalidate(): void {
        super.invalidate();
        this.updateHeader();
        this.updateHints();
        this.updateList();
    }
}
class TodoActionMenuComponent extends Container {
    private selectList: SelectList;
    private onSelectCallback: (action: TodoMenuAction) => void;
    private onCancelCallback: () => void;
    constructor(theme: Theme, todo: TodoRecord, onSelect: (action: TodoMenuAction) => void, onCancel: () => void) {
        super();
        this.onSelectCallback = onSelect;
        this.onCancelCallback = onCancel;
        const closed = isTodoClosed(todo.status);
        const title = todo.title || "(untitled)";
        const options: SelectItem[] = [
            { description: "View todo", label: "view", value: "view" },
            { description: "Work on todo", label: "work", value: "work" },
            { description: "Refine task", label: "refine", value: "refine" },
            ...(closed
                ? [{ description: "Reopen todo", label: "reopen", value: "reopen" }]
                : [{ description: "Close todo", label: "close", value: "close" }]),
            ...(todo.assigned_to_session
                ? [{ description: "Release assignment", label: "release", value: "release" }]
                : []),
            { description: "Copy absolute path to clipboard", label: "copy path", value: "copyPath" },
            { description: "Copy title and body to clipboard", label: "copy text", value: "copyText" },
            { description: "Delete todo", label: "delete", value: "delete" },
        ];
        this.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
        this.addChild(new Text(theme.fg("accent", theme.bold(`Actions for ${formatTodoId(todo.id)} "${title}"`))));
        this.selectList = new SelectList(options, options.length, {
            description: (text) => theme.fg("muted", text),
            noMatch: (text) => theme.fg("warning", text),
            scrollInfo: (text) => theme.fg("dim", text),
            selectedPrefix: (text) => theme.fg("accent", text),
            selectedText: (text) => theme.fg("accent", text),
        });
        this.selectList.onSelect = (item) => this.onSelectCallback(item.value as TodoMenuAction);
        this.selectList.onCancel = () => this.onCancelCallback();
        this.addChild(this.selectList);
        this.addChild(new Text(theme.fg("dim", "Enter to confirm • Esc back")));
        this.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
    }
    handleInput(keyData: string): void {
        this.selectList.handleInput(keyData);
    }
    override invalidate(): void {
        super.invalidate();
    }
}
class TodoDeleteConfirmComponent extends Container {
    private selectList: SelectList;
    private onConfirm: (confirmed: boolean) => void;
    constructor(theme: Theme, message: string, onConfirm: (confirmed: boolean) => void) {
        super();
        this.onConfirm = onConfirm;
        const options: SelectItem[] = [
            { label: "Yes", value: "yes" },
            { label: "No", value: "no" },
        ];
        this.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
        this.addChild(new Text(theme.fg("accent", message)));
        this.selectList = new SelectList(options, options.length, {
            description: (text) => theme.fg("muted", text),
            noMatch: (text) => theme.fg("warning", text),
            scrollInfo: (text) => theme.fg("dim", text),
            selectedPrefix: (text) => theme.fg("accent", text),
            selectedText: (text) => theme.fg("accent", text),
        });
        this.selectList.onSelect = (item) => this.onConfirm(item.value === "yes");
        this.selectList.onCancel = () => this.onConfirm(false);
        this.addChild(this.selectList);
        this.addChild(new Text(theme.fg("dim", "Enter to confirm • Esc back")));
        this.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
    }
    handleInput(keyData: string): void {
        this.selectList.handleInput(keyData);
    }
    override invalidate(): void {
        super.invalidate();
    }
}
class TodoDetailOverlayComponent {
    private todo: TodoRecord;
    private theme: Theme;
    private tui: TUI;
    private markdown: Markdown;
    private scrollOffset = 0;
    private viewHeight = 0;
    private totalLines = 0;
    private onAction: (action: TodoOverlayAction) => void;
    private keybindings?: KeybindingsManager;
    constructor(tui: TUI, theme: Theme, todo: TodoRecord, onAction: (action: TodoOverlayAction) => void, keybindings?: KeybindingsManager) {
        this.tui = tui;
        this.theme = theme;
        this.todo = todo;
        this.onAction = onAction;
        this.keybindings = keybindings;
        this.markdown = new Markdown(this.getMarkdownText(), 1, 0, getMarkdownTheme());
    }
    private getMarkdownText(): string {
        const body = this.todo.body?.trim();
        return body || "_No details yet._";
    }
    handleInput(keyData: string): void {
        const kb = this.keybindings;
        if (this.handleActionInput(keyData, kb)) {
            return;
        }
        this.handleScrollInput(keyData, kb);
    }
    private handleActionInput(keyData: string, kb?: KeybindingsManager): boolean {
        if (kb?.matches(keyData, "tui.select.cancel") || matchesKey(keyData, "escape")) {
            this.onAction("back");
            return true;
        }
        if (kb?.matches(keyData, "tui.select.confirm") || matchesKey(keyData, "enter")) {
            this.onAction("work");
            return true;
        }
        return false;
    }
    private handleScrollInput(keyData: string, kb?: KeybindingsManager): void {
        if (kb?.matches(keyData, "tui.select.up") || matchesKey(keyData, "up")) {
            this.scrollBy(-1);
            return;
        }
        if (kb?.matches(keyData, "tui.select.down") || matchesKey(keyData, "down")) {
            this.scrollBy(1);
            return;
        }
        if (kb?.matches(keyData, "tui.select.pageUp") || matchesKey(keyData, Key.left) || matchesKey(keyData, "pageUp")) {
            this.scrollBy(-(this.viewHeight || 1));
            return;
        }
        if (kb?.matches(keyData, "tui.select.pageDown") || matchesKey(keyData, Key.right) || matchesKey(keyData, "pageDown")) {
            this.scrollBy(this.viewHeight || 1);
        }
    }
    render(width: number): string[] {
        const maxHeight = this.getMaxHeight();
        const headerLines = 3;
        const footerLines = 3;
        const borderLines = 2;
        const innerWidth = Math.max(10, width - 2);
        const contentHeight = Math.max(1, maxHeight - headerLines - footerLines - borderLines);
        const markdownLines = this.markdown.render(innerWidth);
        this.totalLines = markdownLines.length;
        this.viewHeight = contentHeight;
        const maxScroll = Math.max(0, this.totalLines - contentHeight);
        this.scrollOffset = Math.max(0, Math.min(this.scrollOffset, maxScroll));
        const visibleLines = markdownLines.slice(this.scrollOffset, this.scrollOffset + contentHeight);
        const lines: string[] = [
            this.buildTitleLine(innerWidth),
            this.buildMetaLine(innerWidth),
            "",
        ];
        for (const line of visibleLines) {
            lines.push(truncateToWidth(line, innerWidth));
        }
        while (lines.length < headerLines + contentHeight) {
            lines.push("");
        }
        lines.push("");
        lines.push(this.buildActionLine(innerWidth));
        const borderColor = (text: string) => this.theme.fg("borderMuted", text);
        const top = borderColor(`┌${"─".repeat(innerWidth)}┐`);
        const bottom = borderColor(`└${"─".repeat(innerWidth)}┘`);
        const framedLines = lines.map((line) => {
            const truncated = truncateToWidth(line, innerWidth);
            const padding = Math.max(0, innerWidth - visibleWidth(truncated));
            return borderColor("│") + truncated + " ".repeat(padding) + borderColor("│");
        });
        return [top, ...framedLines, bottom].map((line) => truncateToWidth(line, width));
    }
    invalidate(): void {
        this.markdown = new Markdown(this.getMarkdownText(), 1, 0, getMarkdownTheme());
    }
    private getMaxHeight(): number {
        const rows = this.tui.terminal.rows || 24;
        return Math.max(10, Math.floor(rows * 0.8));
    }
    private buildTitleLine(width: number): string {
        const titleText = this.todo.title
            ? ` ${this.todo.title} `
            : ` Todo ${formatTodoId(this.todo.id)} `;
        const titleWidth = visibleWidth(titleText);
        if (titleWidth >= width) {
            return truncateToWidth(this.theme.fg("accent", titleText.trim()), width);
        }
        const leftWidth = Math.max(0, Math.floor((width - titleWidth) / 2));
        const rightWidth = Math.max(0, width - titleWidth - leftWidth);
        return (this.theme.fg("borderMuted", "─".repeat(leftWidth)) +
            this.theme.fg("accent", titleText) +
            this.theme.fg("borderMuted", "─".repeat(rightWidth)));
    }
    private buildMetaLine(width: number): string {
        const status = this.todo.status || "open";
        const statusColor = isTodoClosed(status) ? "dim" : "success";
        const tagText = this.todo.tags.length ? this.todo.tags.join(", ") : "no tags";
        const line = this.theme.fg("accent", formatTodoId(this.todo.id)) +
            this.theme.fg("muted", " • ") +
            this.theme.fg(statusColor, status) +
            this.theme.fg("muted", " • ") +
            this.theme.fg("muted", tagText);
        return truncateToWidth(line, width);
    }
    private buildActionLine(width: number): string {
        const work = this.theme.fg("accent", "enter") + this.theme.fg("muted", " work on todo");
        const back = this.theme.fg("dim", "esc back");
        const nav = this.theme.fg("dim", "↑/↓: move. ←/→: page.");
        const pieces = [work, back, nav];
        let line = pieces.join(this.theme.fg("muted", " • "));
        if (this.totalLines > this.viewHeight) {
            const start = Math.min(this.totalLines, this.scrollOffset + 1);
            const end = Math.min(this.totalLines, this.scrollOffset + this.viewHeight);
            const scrollInfo = this.theme.fg("dim", ` ${start}-${end}/${this.totalLines}`);
            line += scrollInfo;
        }
        return truncateToWidth(line, width);
    }
    private scrollBy(delta: number): void {
        const maxScroll = Math.max(0, this.totalLines - this.viewHeight);
        this.scrollOffset = Math.max(0, Math.min(this.scrollOffset + delta, maxScroll));
    }
}
const getTodosDir = (cwd: string): string => {
    const overridePath = process.env[TODO_PATH_ENV];
    if (overridePath && overridePath.trim()) {
        return path.resolve(cwd, overridePath.trim());
    }
    return path.resolve(cwd, TODO_DIR_NAME);
};
const getTodosDirLabel = (cwd: string): string => {
    const overridePath = process.env[TODO_PATH_ENV];
    if (overridePath && overridePath.trim()) {
        return path.resolve(cwd, overridePath.trim());
    }
    return TODO_DIR_NAME;
};
const getTodoSettingsPath = (todosDir: string): string => 
    path.join(todosDir, TODO_SETTINGS_NAME)
;
const normalizeTodoSettings = (raw: Partial<TodoSettings>): TodoSettings => {
    const gc = raw.gc ?? DEFAULT_TODO_SETTINGS.gc;
    const gcDays = Number.isFinite(raw.gcDays) ? raw.gcDays : DEFAULT_TODO_SETTINGS.gcDays;
    return {
        gc: Boolean(gc),
        gcDays: Math.max(0, Math.floor(gcDays)),
    };
};
const readTodoSettings = async (todosDir: string): Promise<TodoSettings> => {
    const settingsPath = getTodoSettingsPath(todosDir);
    let data: Partial<TodoSettings> = {};
    try {
        const raw = await fs.readFile(settingsPath, "utf-8");
        data = JSON.parse(raw) as Partial<TodoSettings>;
    }
    catch {
        data = {};
    }
    return normalizeTodoSettings(data);
};
const garbageCollectTodos = async (todosDir: string, settings: TodoSettings): Promise<void> => {
    if (!settings.gc) {
        return;
    }
    let entries: string[] = [];
    try {
        entries = await fs.readdir(todosDir);
    }
    catch {
        return;
    }
    const cutoff = Date.now() - settings.gcDays * 24 * 60 * 60 * 1000;
    await Promise.all(entries
        .filter((entry) => entry.endsWith(".md"))
        .map(async (entry) => {
        const id = entry.slice(0, -3);
        const filePath = path.join(todosDir, entry);
        try {
            const content = await fs.readFile(filePath, "utf-8");
            const { frontMatter } = splitFrontMatter(content);
            const parsed = parseFrontMatter(frontMatter, id);
            if (!isTodoClosed(parsed.status)) {
                return;
            }
            const createdAt = Date.parse(parsed.created_at);
            if (!Number.isFinite(createdAt)) {
                return;
            }
            if (createdAt < cutoff) {
                await fs.unlink(filePath);
            }
        }
        catch {
            // ignore unreadable todo
        }
    }));
};
const getTodoPath = (todosDir: string, id: string): string => 
    path.join(todosDir, `${id}.md`)
;
const getLockPath = (todosDir: string, id: string): string => 
    path.join(todosDir, `${id}.lock`)
;
const parseFrontMatter = (text: string, idFallback: string): TodoFrontMatter => {
    const data: TodoFrontMatter = {
        assigned_to_session: undefined,
        created_at: "",
        id: idFallback,
        status: "open",
        tags: [],
        title: "",
    };
    const trimmed = text.trim();
    if (!trimmed) {
        return data;
    }
    try {
        const parsed = JSON.parse(trimmed) as Partial<TodoFrontMatter> | null;
        if (!parsed || typeof parsed !== "object") {
            return data;
        }
        if (typeof parsed.id === "string" && parsed.id) {
            data.id = parsed.id;
        }
        if (typeof parsed.title === "string") {
            data.title = parsed.title;
        }
        if (typeof parsed.status === "string" && parsed.status) {
            data.status = parsed.status;
        }
        if (typeof parsed.created_at === "string") {
            data.created_at = parsed.created_at;
        }
        if (typeof parsed.assigned_to_session === "string" && parsed.assigned_to_session.trim()) {
            data.assigned_to_session = parsed.assigned_to_session;
        }
        if (Array.isArray(parsed.tags)) {
            data.tags = parsed.tags.filter((tag): tag is string => typeof tag === "string");
        }
    }
    catch {
        return data;
    }
    return data;
};
const findJsonObjectEnd = (content: string): number => {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = 0; i < content.length; i += 1) {
        const char = content[i];
        if (inString) {
            if (escaped) {
                escaped = false;
                continue;
            }
            if (char === "\\") {
                escaped = true;
                continue;
            }
            if (char === "\"") {
                inString = false;
            }
            continue;
        }
        if (char === "\"") {
            inString = true;
            continue;
        }
        if (char === "{") {
            depth += 1;
            continue;
        }
        if (char === "}") {
            depth -= 1;
            if (depth === 0) {
                return i;
            }
        }
    }
    return -1;
};
const splitFrontMatter = (content: string): {
    frontMatter: string;
    body: string;
} => {
    if (!content.startsWith("{")) {
        return { body: content, frontMatter: "" };
    }
    const endIndex = findJsonObjectEnd(content);
    if (endIndex === -1) {
        return { body: content, frontMatter: "" };
    }
    const frontMatter = content.slice(0, endIndex + 1);
    const body = content.slice(endIndex + 1).replace(/^\r?\n+/u, "");
    return { body, frontMatter };
};
const parseTodoContent = (content: string, idFallback: string): TodoRecord => {
    const { frontMatter, body } = splitFrontMatter(content);
    const parsed = parseFrontMatter(frontMatter, idFallback);
    return {
        assigned_to_session: parsed.assigned_to_session,
        body: body ?? "",
        created_at: parsed.created_at,
        id: idFallback,
        status: parsed.status,
        tags: parsed.tags ?? [],
        title: parsed.title,
    };
};
const serializeTodo = (todo: TodoRecord): string => {
    const frontMatter = JSON.stringify({
        assigned_to_session: todo.assigned_to_session || undefined,
        created_at: todo.created_at,
        id: todo.id,
        status: todo.status,
        tags: todo.tags ?? [],
        title: todo.title,
    }, null, 2);
    const body = todo.body ?? "";
    const trimmedBody = body.replace(/^\n+/u, "").replace(/\s+$/u, "");
    if (!trimmedBody) {
        return `${frontMatter}\n`;
    }
    return `${frontMatter}\n\n${trimmedBody}\n`;
};
const ensureTodosDir = async (todosDir: string) => {
    await fs.mkdir(todosDir, { recursive: true });
};
const readTodoFile = async (filePath: string, idFallback: string): Promise<TodoRecord> => {
    const content = await fs.readFile(filePath, "utf-8");
    return parseTodoContent(content, idFallback);
};
const writeTodoFile = async (filePath: string, todo: TodoRecord) => {
    await fs.writeFile(filePath, serializeTodo(todo), "utf-8");
};
const generateTodoId = (todosDir: string): string => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
        const id = crypto.randomBytes(4).toString("hex");
        const todoPath = getTodoPath(todosDir, id);
        if (!existsSync(todoPath)) {
            return id;
        }
    }
    throw new Error("Failed to generate unique todo id");
};
const readLockInfo = async (lockPath: string): Promise<LockInfo | null> => {
    try {
        const raw = await fs.readFile(lockPath, "utf-8");
        return JSON.parse(raw) as LockInfo;
    }
    catch {
        return null;
    }
};
const getErrorCode = (error: unknown): string | undefined => {
    if (error && typeof error === "object" && "code" in error) {
        return String((error as { code?: unknown }).code);
    }
    return undefined;
};
const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) {
        return error.message;
    }
    return "unknown error";
};
const ignoreAsyncError = (error: unknown): void => {
    void error;
};
const acquireLock = async (todosDir: string, id: string, ctx: ExtensionContext): Promise<(() => Promise<void>) | {
    error: string;
}> => {
    const lockPath = getLockPath(todosDir, id);
    const now = Date.now();
    const session = ctx.sessionManager.getSessionFile();
    for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
            const handle = await fs.open(lockPath, "wx");
            const info: LockInfo = {
                created_at: new Date(now).toISOString(),
                id,
                pid: process.pid,
                session,
            };
            await handle.writeFile(JSON.stringify(info, null, 2), "utf-8");
            await handle.close();
            return async () => {
                try {
                    await fs.unlink(lockPath);
                }
                catch {
                    // ignore
                }
            };
        }
        catch (error: unknown) {
            const code = getErrorCode(error);
            if (code !== "EEXIST") {
                return { error: `Failed to acquire lock: ${getErrorMessage(error)}` };
            }
            const stats = await fs.stat(lockPath).catch(() => null);
            const lockAge = stats ? now - stats.mtimeMs : LOCK_TTL_MS + 1;
            if (lockAge <= LOCK_TTL_MS) {
                const info = await readLockInfo(lockPath);
                const owner = info?.session ? ` (session ${info.session})` : "";
                return { error: `Todo ${displayTodoId(id)} is locked${owner}. Try again later.` };
            }
            if (!ctx.hasUI) {
                return { error: `Todo ${displayTodoId(id)} lock is stale; rerun in interactive mode to steal it.` };
            }
            const ok = await ctx.ui.confirm("Todo locked", `Todo ${displayTodoId(id)} appears locked. Steal the lock?`);
            if (!ok) {
                return { error: `Todo ${displayTodoId(id)} remains locked.` };
            }
            await fs.unlink(lockPath).catch(ignoreAsyncError);
        }
    }
    return { error: `Failed to acquire lock for todo ${displayTodoId(id)}.` };
};
const withTodoLock = async <T>(todosDir: string, id: string, ctx: ExtensionContext, fn: () => Promise<T>): Promise<T | {
    error: string;
}> => {
    const lock = await acquireLock(todosDir, id, ctx);
    if (typeof lock === "object" && "error" in lock) {
        return lock;
    }
    try {
        return await fn();
    }
    finally {
        await lock();
    }
};
const listTodos = async (todosDir: string): Promise<TodoFrontMatter[]> => {
    let entries: string[] = [];
    try {
        entries = await fs.readdir(todosDir);
    }
    catch {
        return [];
    }
    const todos: TodoFrontMatter[] = [];
    for (const entry of entries) {
        if (!entry.endsWith(".md")) {
            continue;
        }
        const id = entry.slice(0, -3);
        const filePath = path.join(todosDir, entry);
        try {
            const content = await fs.readFile(filePath, "utf-8");
            const { frontMatter } = splitFrontMatter(content);
            const parsed = parseFrontMatter(frontMatter, id);
            todos.push({
                assigned_to_session: parsed.assigned_to_session,
                created_at: parsed.created_at,
                id,
                status: parsed.status,
                tags: parsed.tags ?? [],
                title: parsed.title,
            });
        }
        catch {
            // ignore unreadable todo
        }
    }
    return sortTodos(todos);
};
const listTodosSync = (todosDir: string): TodoFrontMatter[] => {
    let entries: string[] = [];
    try {
        entries = readdirSync(todosDir);
    }
    catch {
        return [];
    }
    const todos: TodoFrontMatter[] = [];
    for (const entry of entries) {
        if (!entry.endsWith(".md")) {
            continue;
        }
        const id = entry.slice(0, -3);
        const filePath = path.join(todosDir, entry);
        try {
            const content = readFileSync(filePath, "utf-8");
            const { frontMatter } = splitFrontMatter(content);
            const parsed = parseFrontMatter(frontMatter, id);
            todos.push({
                assigned_to_session: parsed.assigned_to_session,
                created_at: parsed.created_at,
                id,
                status: parsed.status,
                tags: parsed.tags ?? [],
                title: parsed.title,
            });
        }
        catch {
            // ignore
        }
    }
    return sortTodos(todos);
};
const getTodoTitle = (todo: TodoFrontMatter): string => 
    todo.title || "(untitled)"
;
const getTodoStatus = (todo: TodoFrontMatter): string => 
    todo.status || "open"
;
const formatAssignmentSuffix = (todo: TodoFrontMatter): string => 
    todo.assigned_to_session ? ` (assigned: ${todo.assigned_to_session})` : ""
;
const renderAssignmentSuffix = (theme: Theme, todo: TodoFrontMatter, currentSessionId?: string): string => {
    if (!todo.assigned_to_session) {
        return "";
    }
    const isCurrent = todo.assigned_to_session === currentSessionId;
    const color = isCurrent ? "success" : "dim";
    const suffix = isCurrent ? ", current" : "";
    return theme.fg(color, ` (assigned: ${todo.assigned_to_session}${suffix})`);
};
const formatTodoHeading = (todo: TodoFrontMatter): string => {
    const tagText = todo.tags.length ? ` [${todo.tags.join(", ")}]` : "";
    return `${formatTodoId(todo.id)} ${getTodoTitle(todo)}${tagText}${formatAssignmentSuffix(todo)}`;
};
const buildRefinePrompt = (todoId: string, title: string): string => 
    (`let's refine task ${formatTodoId(todoId)} "${title}": ` +
        "Ask me for the missing details needed to refine the todo together. Do not rewrite the todo yet and do not make assumptions. " +
        "Ask clear, concrete questions and wait for my answers before drafting any structured description.\n\n")
;
const splitTodosByAssignment = (todos: TodoFrontMatter[]): {
    assignedTodos: TodoFrontMatter[];
    openTodos: TodoFrontMatter[];
    closedTodos: TodoFrontMatter[];
} => {
    const assignedTodos: TodoFrontMatter[] = [];
    const openTodos: TodoFrontMatter[] = [];
    const closedTodos: TodoFrontMatter[] = [];
    for (const todo of todos) {
        if (isTodoClosed(getTodoStatus(todo))) {
            closedTodos.push(todo);
            continue;
        }
        if (todo.assigned_to_session) {
            assignedTodos.push(todo);
        }
        else {
            openTodos.push(todo);
        }
    }
    return { assignedTodos, closedTodos, openTodos };
};
const formatTodoList = (todos: TodoFrontMatter[]): string => {
    if (!todos.length) {
        return "No todos.";
    }
    const { assignedTodos, openTodos, closedTodos } = splitTodosByAssignment(todos);
    const lines: string[] = [];
    const pushSection = (label: string, sectionTodos: TodoFrontMatter[]) => {
        lines.push(`${label} (${sectionTodos.length}):`);
        if (!sectionTodos.length) {
            lines.push("  none");
            return;
        }
        for (const todo of sectionTodos) {
            lines.push(`  ${formatTodoHeading(todo)}`);
        }
    };
    pushSection("Assigned todos", assignedTodos);
    pushSection("Open todos", openTodos);
    pushSection("Closed todos", closedTodos);
    return lines.join("\n");
};
const serializeTodoForAgent = (todo: TodoRecord): string => {
    const payload = { ...todo, id: formatTodoId(todo.id) };
    return JSON.stringify(payload, null, 2);
};
const serializeTodoListForAgent = (todos: TodoFrontMatter[]): string => {
    const { assignedTodos, openTodos, closedTodos } = splitTodosByAssignment(todos);
    const mapTodo = (todo: TodoFrontMatter) => ({ ...todo, id: formatTodoId(todo.id) });
    return JSON.stringify({
        assigned: assignedTodos.map(mapTodo),
        closed: closedTodos.map(mapTodo),
        open: openTodos.map(mapTodo),
    }, null, 2);
};
const renderTodoHeading = (theme: Theme, todo: TodoFrontMatter, currentSessionId?: string): string => {
    const closed = isTodoClosed(getTodoStatus(todo));
    const titleColor = closed ? "dim" : "text";
    const tagText = todo.tags.length ? theme.fg("dim", ` [${todo.tags.join(", ")}]`) : "";
    const assignmentText = renderAssignmentSuffix(theme, todo, currentSessionId);
    return (`${theme.fg("accent", formatTodoId(todo.id))} ${theme.fg(titleColor, getTodoTitle(todo))}${tagText}${assignmentText}`);
};
const renderTodoList = (theme: Theme, todos: TodoFrontMatter[], expanded: boolean, currentSessionId?: string): string => {
    if (!todos.length) {
        return theme.fg("dim", "No todos");
    }
    const { assignedTodos, openTodos, closedTodos } = splitTodosByAssignment(todos);
    const lines: string[] = [];
    const pushSection = (label: string, sectionTodos: TodoFrontMatter[]) => {
        lines.push(theme.fg("muted", `${label} (${sectionTodos.length})`));
        if (!sectionTodos.length) {
            lines.push(theme.fg("dim", "  none"));
            return;
        }
        const maxItems = expanded ? sectionTodos.length : Math.min(sectionTodos.length, 3);
        for (let i = 0; i < maxItems; i += 1) {
            lines.push(`  ${renderTodoHeading(theme, sectionTodos[i], currentSessionId)}`);
        }
        if (!expanded && sectionTodos.length > maxItems) {
            lines.push(theme.fg("dim", `  ... ${sectionTodos.length - maxItems} more`));
        }
    };
    const sections: {
        label: string;
        todos: TodoFrontMatter[];
    }[] = [
        { label: "Assigned todos", todos: assignedTodos },
        { label: "Open todos", todos: openTodos },
        { label: "Closed todos", todos: closedTodos },
    ];
    for (const [index, section] of sections.entries()) {
        if (index > 0) {
            lines.push("");
        }
        pushSection(section.label, section.todos);
    }
    return lines.join("\n");
};
const renderTodoDetail = (theme: Theme, todo: TodoRecord, expanded: boolean): string => {
    const summary = renderTodoHeading(theme, todo);
    if (!expanded) {
        return summary;
    }
    const tags = todo.tags.length ? todo.tags.join(", ") : "none";
    const createdAt = todo.created_at || "unknown";
    const bodyText = todo.body?.trim() ? todo.body.trim() : "No details yet.";
    const bodyLines = bodyText.split("\n");
    const lines = [
        summary,
        theme.fg("muted", `Status: ${getTodoStatus(todo)}`),
        theme.fg("muted", `Tags: ${tags}`),
        theme.fg("muted", `Created: ${createdAt}`),
        "",
        theme.fg("muted", "Body:"),
        ...bodyLines.map((line) => theme.fg("text", `  ${line}`)),
    ];
    return lines.join("\n");
};
const appendExpandHint = (theme: Theme, text: string): string => 
    `${text}\n${theme.fg("dim", `(${keyHint("app.tools.expand", "to expand")})`)}`
;
const ensureTodoExists = (filePath: string, id: string): Promise<TodoRecord | null> => {
    if (!existsSync(filePath)) {
        return Promise.resolve(null);
    }
    return readTodoFile(filePath, id);
};
const appendTodoBody = async (filePath: string, todo: TodoRecord, text: string): Promise<TodoRecord> => {
    const spacer = todo.body.trim().length ? "\n\n" : "";
    todo.body = `${todo.body.replace(/\s+$/u, "")}${spacer}${text.trim()}\n`;
    await writeTodoFile(filePath, todo);
    return todo;
};
const updateTodoStatus = async (todosDir: string, id: string, status: string, ctx: ExtensionContext): Promise<TodoRecord | {
    error: string;
}> => {
    const validated = validateTodoId(id);
    if ("error" in validated) {
        return { error: validated.error };
    }
    const normalizedId = validated.id;
    const filePath = getTodoPath(todosDir, normalizedId);
    if (!existsSync(filePath)) {
        return { error: `Todo ${displayTodoId(id)} not found` };
    }
    const result = await withTodoLock(todosDir, normalizedId, ctx, async () => {
        const existing = await ensureTodoExists(filePath, normalizedId);
        if (!existing) {
            return { error: `Todo ${displayTodoId(id)} not found` } as const;
        }
        existing.status = status;
        clearAssignmentIfClosed(existing);
        await writeTodoFile(filePath, existing);
        return existing;
    });
    if (typeof result === "object" && "error" in result) {
        return { error: result.error };
    }
    return result;
};
const claimTodoAssignment = async (todosDir: string, id: string, ctx: ExtensionContext, force = false): Promise<TodoRecord | {
    error: string;
}> => {
    const validated = validateTodoId(id);
    if ("error" in validated) {
        return { error: validated.error };
    }
    const normalizedId = validated.id;
    const filePath = getTodoPath(todosDir, normalizedId);
    if (!existsSync(filePath)) {
        return { error: `Todo ${displayTodoId(id)} not found` };
    }
    const sessionId = ctx.sessionManager.getSessionId();
    const result = await withTodoLock(todosDir, normalizedId, ctx, async () => {
        const existing = await ensureTodoExists(filePath, normalizedId);
        if (!existing) {
            return { error: `Todo ${displayTodoId(id)} not found` } as const;
        }
        if (isTodoClosed(existing.status)) {
            return { error: `Todo ${displayTodoId(id)} is closed` } as const;
        }
        const assigned = existing.assigned_to_session;
        if (assigned && assigned !== sessionId && !force) {
            return {
                error: `Todo ${displayTodoId(id)} is already assigned to session ${assigned}. Use force to override.`,
            } as const;
        }
        if (assigned !== sessionId) {
            existing.assigned_to_session = sessionId;
            await writeTodoFile(filePath, existing);
        }
        return existing;
    });
    if (typeof result === "object" && "error" in result) {
        return { error: result.error };
    }
    return result;
};
const releaseTodoAssignment = async (todosDir: string, id: string, ctx: ExtensionContext, force = false): Promise<TodoRecord | {
    error: string;
}> => {
    const validated = validateTodoId(id);
    if ("error" in validated) {
        return { error: validated.error };
    }
    const normalizedId = validated.id;
    const filePath = getTodoPath(todosDir, normalizedId);
    if (!existsSync(filePath)) {
        return { error: `Todo ${displayTodoId(id)} not found` };
    }
    const sessionId = ctx.sessionManager.getSessionId();
    const result = await withTodoLock(todosDir, normalizedId, ctx, async () => {
        const existing = await ensureTodoExists(filePath, normalizedId);
        if (!existing) {
            return { error: `Todo ${displayTodoId(id)} not found` } as const;
        }
        const assigned = existing.assigned_to_session;
        if (!assigned) {
            return existing;
        }
        if (assigned !== sessionId && !force) {
            return {
                error: `Todo ${displayTodoId(id)} is assigned to session ${assigned}. Use force to release.`,
            } as const;
        }
        existing.assigned_to_session = undefined;
        await writeTodoFile(filePath, existing);
        return existing;
    });
    if (typeof result === "object" && "error" in result) {
        return { error: result.error };
    }
    return result;
};
const deleteTodo = async (todosDir: string, id: string, ctx: ExtensionContext): Promise<TodoRecord | {
    error: string;
}> => {
    const validated = validateTodoId(id);
    if ("error" in validated) {
        return { error: validated.error };
    }
    const normalizedId = validated.id;
    const filePath = getTodoPath(todosDir, normalizedId);
    if (!existsSync(filePath)) {
        return { error: `Todo ${displayTodoId(id)} not found` };
    }
    const result = await withTodoLock(todosDir, normalizedId, ctx, async () => {
        const existing = await ensureTodoExists(filePath, normalizedId);
        if (!existing) {
            return { error: `Todo ${displayTodoId(id)} not found` } as const;
        }
        await fs.unlink(filePath);
        return existing;
    });
    if (typeof result === "object" && "error" in result) {
        return { error: result.error };
    }
    return result;
};

interface TodoToolParams {
    action: TodoAction;
    body?: string;
    force?: boolean;
    id?: string;
    status?: string;
    tags?: string[];
    title?: string;
}

const todoTextContent = (text: string) => ({ text, type: "text" as const });

const todoToolError = (action: TodoAction, error: string, text = `Error: ${error}`) => ({
    content: [todoTextContent(text)],
    details: { action, error },
});

const todoToolRecordResult = (action: TodoAction, todo: TodoRecord) => ({
    content: [todoTextContent(serializeTodoForAgent(todo))],
    details: { action, todo },
});

const todoToolListResult = (
    action: "list" | "list-all",
    todos: TodoFrontMatter[],
    currentSessionId: string,
) => ({
    content: [todoTextContent(serializeTodoListForAgent(todos))],
    details: { action, currentSessionId, todos },
});

const requireTodoIdParam = (
    action: TodoAction,
    params: TodoToolParams,
): { error: ReturnType<typeof todoToolError> } | { id: string } => {
    if (params.id) {
        return { id: params.id };
    }
    return { error: todoToolError(action, "id required") };
};

const handleTodoListAction = async (
    todosDir: string,
    ctx: ExtensionContext,
    includeClosed: boolean,
) => {
    const todos = await listTodos(todosDir);
    const currentSessionId = ctx.sessionManager.getSessionId();
    if (includeClosed) {
        return todoToolListResult("list-all", todos, currentSessionId);
    }
    const { assignedTodos, openTodos } = splitTodosByAssignment(todos);
    return todoToolListResult("list", [...assignedTodos, ...openTodos], currentSessionId);
};

const handleTodoGetAction = async (todosDir: string, params: TodoToolParams) => {
    const required = requireTodoIdParam("get", params);
    if ("error" in required) {
        return required.error;
    }
    const validated = validateTodoId(required.id);
    if ("error" in validated) {
        return todoToolError("get", validated.error, validated.error);
    }
    const normalizedId = validated.id;
    const displayId = formatTodoId(normalizedId);
    const filePath = getTodoPath(todosDir, normalizedId);
    const todo = await ensureTodoExists(filePath, normalizedId);
    if (todo) {
        return todoToolRecordResult("get", todo);
    }
    return todoToolError("get", "not found", `Todo ${displayId} not found`);
};

const handleTodoCreateAction = async (
    todosDir: string,
    params: TodoToolParams,
    ctx: ExtensionContext,
) => {
    if (!params.title) {
        return todoToolError("create", "title required");
    }
    await ensureTodosDir(todosDir);
    const id = await generateTodoId(todosDir);
    const filePath = getTodoPath(todosDir, id);
    const todo: TodoRecord = {
        body: params.body ?? "",
        created_at: new Date().toISOString(),
        id,
        status: params.status ?? "open",
        tags: params.tags ?? [],
        title: params.title,
    };
    const result = await withTodoLock(todosDir, id, ctx, async () => {
        await writeTodoFile(filePath, todo);
        return todo;
    });
    if (typeof result === "object" && "error" in result) {
        return todoToolError("create", result.error, result.error);
    }
    return todoToolRecordResult("create", todo);
};

const applyTodoUpdateParams = (todo: TodoRecord, params: TodoToolParams): void => {
    if (params.title !== undefined) {
        todo.title = params.title;
    }
    if (params.status !== undefined) {
        todo.status = params.status;
    }
    if (params.tags !== undefined) {
        todo.tags = params.tags;
    }
    if (params.body !== undefined) {
        todo.body = params.body;
    }
    if (!todo.created_at) {
        todo.created_at = new Date().toISOString();
    }
    clearAssignmentIfClosed(todo);
};

const handleTodoUpdateAction = async (
    todosDir: string,
    params: TodoToolParams,
    ctx: ExtensionContext,
) => {
    const prepared = prepareExistingTodoAction("update", todosDir, params);
    if ("error" in prepared) {
        return prepared.error;
    }
    const { displayId, filePath, normalizedId } = prepared;
    const result = await withTodoLock(todosDir, normalizedId, ctx, async () => {
        const existing = await ensureTodoExists(filePath, normalizedId);
        if (existing) {
            existing.id = normalizedId;
            applyTodoUpdateParams(existing, params);
            await writeTodoFile(filePath, existing);
            return existing;
        }
        return { error: `Todo ${displayId} not found` } as const;
    });
    if (typeof result === "object" && "error" in result) {
        return todoToolError("update", result.error, result.error);
    }
    return todoToolRecordResult("update", result as TodoRecord);
};

const handleTodoAppendAction = async (
    todosDir: string,
    params: TodoToolParams,
    ctx: ExtensionContext,
) => {
    const prepared = prepareExistingTodoAction("append", todosDir, params);
    if ("error" in prepared) {
        return prepared.error;
    }
    const { displayId, filePath, normalizedId } = prepared;
    const result = await withTodoLock(todosDir, normalizedId, ctx, async () => {
        const existing = await ensureTodoExists(filePath, normalizedId);
        if (!existing) {
            return { error: `Todo ${displayId} not found` } as const;
        }
        if (!params.body || !params.body.trim()) {
            return existing;
        }
        return appendTodoBody(filePath, existing, params.body);
    });
    if (typeof result === "object" && "error" in result) {
        return todoToolError("append", result.error, result.error);
    }
    return todoToolRecordResult("append", result as TodoRecord);
};

const prepareExistingTodoAction = (
    action: TodoAction,
    todosDir: string,
    params: TodoToolParams,
):
    | { displayId: string; filePath: string; normalizedId: string }
    | { error: ReturnType<typeof todoToolError> } => {
    const required = requireTodoIdParam(action, params);
    if ("error" in required) {
        return { error: required.error };
    }
    const validated = validateTodoId(required.id);
    if ("error" in validated) {
        return { error: todoToolError(action, validated.error, validated.error) };
    }
    const normalizedId = validated.id;
    const displayId = formatTodoId(normalizedId);
    const filePath = getTodoPath(todosDir, normalizedId);
    if (!existsSync(filePath)) {
        return { error: todoToolError(action, "not found", `Todo ${displayId} not found`) };
    }
    return { displayId, filePath, normalizedId };
};

const handleTodoClaimAction = async (
    todosDir: string,
    params: TodoToolParams,
    ctx: ExtensionContext,
) => {
    const required = requireTodoIdParam("claim", params);
    if ("error" in required) {
        return required.error;
    }
    const result = await claimTodoAssignment(todosDir, required.id, ctx, Boolean(params.force));
    if (typeof result === "object" && "error" in result) {
        return todoToolError("claim", result.error, result.error);
    }
    return todoToolRecordResult("claim", result as TodoRecord);
};

const handleTodoReleaseAction = async (
    todosDir: string,
    params: TodoToolParams,
    ctx: ExtensionContext,
) => {
    const required = requireTodoIdParam("release", params);
    if ("error" in required) {
        return required.error;
    }
    const result = await releaseTodoAssignment(todosDir, required.id, ctx, Boolean(params.force));
    if (typeof result === "object" && "error" in result) {
        return todoToolError("release", result.error, result.error);
    }
    return todoToolRecordResult("release", result as TodoRecord);
};

const handleTodoDeleteAction = async (
    todosDir: string,
    params: TodoToolParams,
    ctx: ExtensionContext,
) => {
    const prepared = prepareExistingTodoAction("delete", todosDir, params);
    if ("error" in prepared) {
        return prepared.error;
    }
    const result = await deleteTodo(todosDir, prepared.normalizedId, ctx);
    if (typeof result === "object" && "error" in result) {
        return todoToolError("delete", result.error, result.error);
    }
    return todoToolRecordResult("delete", result as TodoRecord);
};

const executeTodoToolAction = (
    params: TodoToolParams,
    ctx: ExtensionContext,
) => {
    const todosDir = getTodosDir(ctx.cwd);
    switch (params.action) {
        case "list": {
            return handleTodoListAction(todosDir, ctx, false);
        }
        case "list-all": {
            return handleTodoListAction(todosDir, ctx, true);
        }
        case "get": {
            return handleTodoGetAction(todosDir, params);
        }
        case "create": {
            return handleTodoCreateAction(todosDir, params, ctx);
        }
        case "update": {
            return handleTodoUpdateAction(todosDir, params, ctx);
        }
        case "append": {
            return handleTodoAppendAction(todosDir, params, ctx);
        }
        case "claim": {
            return handleTodoClaimAction(todosDir, params, ctx);
        }
        case "release": {
            return handleTodoReleaseAction(todosDir, params, ctx);
        }
        case "delete": {
            return handleTodoDeleteAction(todosDir, params, ctx);
        }
        default: {
            return todoToolError(params.action, `Unsupported todo action: ${params.action}`);
        }
    }
};


interface TodoRenderResultInput {
    content: { text?: string; type: string }[];
    details?: unknown;
}

interface TodoRenderOptions {
    expanded: boolean;
    isPartial: boolean;
}

const renderFallbackTodoToolContent = (result: TodoRenderResultInput): Text => {
    const [firstContent] = result.content;
    const text = firstContent?.type === "text" ? firstContent.text : "";
    return new Text(text, 0, 0);
};

const renderTodoListToolResult = (
    details: Extract<TodoToolDetails, { action: "list" | "list-all" }>,
    expanded: boolean,
    theme: Theme,
): Text => {
    let text = renderTodoList(theme, details.todos, expanded, details.currentSessionId);
    if (!expanded) {
        const { closedTodos } = splitTodosByAssignment(details.todos);
        if (closedTodos.length) {
            text = appendExpandHint(theme, text);
        }
    }
    return new Text(text, 0, 0);
};

const getTodoActionLabel = (action: TodoAction): string | null => {
    switch (action) {
        case "append": {
            return "Appended to";
        }
        case "claim": {
            return "Claimed";
        }
        case "create": {
            return "Created";
        }
        case "delete": {
            return "Deleted";
        }
        case "release": {
            return "Released";
        }
        case "update": {
            return "Updated";
        }
        case "get":
        case "list":
        case "list-all": {
            return null;
        }
        default: {
            return null;
        }
    }
};

const renderTodoRecordToolResult = (
    details: Extract<TodoToolDetails, { todo: TodoRecord }>,
    expanded: boolean,
    theme: Theme,
): Text => {
    let text = renderTodoDetail(theme, details.todo, expanded);
    const actionLabel = getTodoActionLabel(details.action);
    if (actionLabel) {
        const lines = text.split("\n");
        const [heading = "", ...rest] = lines;
        text = [
            `${theme.fg("success", "✓ ")}${theme.fg("muted", `${actionLabel} `)}${heading}`,
            ...rest,
        ].join("\n");
    }
    if (!expanded) {
        text = appendExpandHint(theme, text);
    }
    return new Text(text, 0, 0);
};

const renderTodoToolResult = (
    result: TodoRenderResultInput,
    options: TodoRenderOptions,
    theme: Theme,
): Text => {
    if (options.isPartial) {
        return new Text(theme.fg("warning", "Processing..."), 0, 0);
    }
    const details = result.details as TodoToolDetails | undefined;
    if (!details) {
        return renderFallbackTodoToolContent(result);
    }
    if (details.error) {
        return new Text(theme.fg("error", `Error: ${details.error}`), 0, 0);
    }
    if (details.action === "list" || details.action === "list-all") {
        return renderTodoListToolResult(details, options.expanded, theme);
    }
    if ("todo" in details && details.todo) {
        return renderTodoRecordToolResult(details, options.expanded, theme);
    }
    return renderFallbackTodoToolContent(result);
};

const todosExtension = (pi: ExtensionAPI) => {
    pi.on("session_start", async (_event, ctx) => {
        const todosDir = getTodosDir(ctx.cwd);
        await ensureTodosDir(todosDir);
        const settings = await readTodoSettings(todosDir);
        await garbageCollectTodos(todosDir, settings);
    });
    const todosDirLabel = getTodosDirLabel(process.cwd());
    pi.registerTool({
        description: `Manage file-based todos in ${todosDirLabel} (list, list-all, get, create, update, append, delete, claim, release). ` +
            "Title is the short summary; body is long-form markdown notes (update replaces, append adds). " +
            "Todo ids are shown as TODO-<hex>; id parameters accept TODO-<hex> or the raw hex filename. " +
            "Claim tasks before working on them to avoid conflicts, and close them when complete.",
        execute: (_toolCallId, params, _signal, _onUpdate, ctx) => executeTodoToolAction(params as TodoToolParams, ctx),
        label: "Todo",
        name: "todo",
        parameters: TodoParams,
        promptSnippet: `todo: Manage file-based todos in ${todosDirLabel} (list, list-all, get, create, update, append, delete, claim, release). Claim tasks before working on them to avoid conflicts, and close them when complete.`,
        renderCall(args, theme) {
            const action = typeof args.action === "string" ? args.action : "";
            const id = typeof args.id === "string" ? args.id : "";
            const normalizedId = id ? normalizeTodoId(id) : "";
            const title = typeof args.title === "string" ? args.title : "";
            let text = `${theme.fg("toolTitle", theme.bold("todo "))}${theme.fg("muted", action)}`;
            if (normalizedId) {
                text += ` ${theme.fg("accent", formatTodoId(normalizedId))}`;
            }
            if (title) {
                text += ` ${theme.fg("dim", `"${title}"`)}`;
            }
            return new Text(text, 0, 0);
        },
        renderResult: (result, options, theme) => renderTodoToolResult(result, options, theme),
    });
    pi.registerCommand("todos", {
        description: "List todos from .pi/todos",
        getArgumentCompletions: (argumentPrefix: string) => {
            const todos = listTodosSync(getTodosDir(process.cwd()));
            if (!todos.length) {
                return null;
            }
            const matches = filterTodos(todos, argumentPrefix);
            if (!matches.length) {
                return null;
            }
            return matches.map((todo) => {
                const title = todo.title || "(untitled)";
                const tags = todo.tags.length ? ` • ${todo.tags.join(", ")}` : "";
                return {
                    description: `${todo.status || "open"}${tags}`,
                    label: `${formatTodoId(todo.id)} ${title}`,
                    value: title,
                };
            });
        },
        handler: async (args, ctx) => {
            const todosDir = getTodosDir(ctx.cwd);
            const todos = await listTodos(todosDir);
            const currentSessionId = ctx.sessionManager.getSessionId();
            const searchTerm = (args ?? "").trim();
            if (!ctx.hasUI) {
                const text = formatTodoList(todos);
                console.log(text);
                return;
            }
            let nextPrompt: string | null = null;
            let rootTui: TUI | null = null;
            await ctx.ui.custom<null>((tui, theme, kb, done) => {
                rootTui = tui;
                let selector: TodoSelectorComponent | null = null;
                let actionMenu: TodoActionMenuComponent | null = null;
                let deleteConfirm: TodoDeleteConfirmComponent | null = null;
                let activeComponent: {
                    render: (width: number) => string[];
                    invalidate: () => void;
                    handleInput?: (data: string) => void;
                    focused?: boolean;
                } | null = null;
                let wrapperFocused = false;
                const setActiveComponent = (component: {
                    render: (width: number) => string[];
                    invalidate: () => void;
                    handleInput?: (data: string) => void;
                    focused?: boolean;
                } | null) => {
                    if (activeComponent && "focused" in activeComponent) {
                        activeComponent.focused = false;
                    }
                    activeComponent = component;
                    if (activeComponent && "focused" in activeComponent) {
                        activeComponent.focused = wrapperFocused;
                    }
                    tui.requestRender();
                };
                const copyTodoPathToClipboard = (todoId: string) => {
                    const filePath = getTodoPath(todosDir, todoId);
                    const absolutePath = path.resolve(filePath);
                    try {
                        copyToClipboard(absolutePath);
                        ctx.ui.notify(`Copied ${absolutePath} to clipboard`, "info");
                    }
                    catch (error) {
                        const message = error instanceof Error ? error.message : String(error);
                        ctx.ui.notify(message, "error");
                    }
                };
                const copyTodoTextToClipboard = (record: TodoRecord) => {
                    const title = record.title || "(untitled)";
                    const body = record.body?.trim() || "";
                    const text = body ? `# ${title}\n\n${body}` : `# ${title}`;
                    try {
                        copyToClipboard(text);
                        ctx.ui.notify("Copied todo text to clipboard", "info");
                    }
                    catch (error) {
                        const message = error instanceof Error ? error.message : String(error);
                        ctx.ui.notify(message, "error");
                    }
                };
                const resolveTodoRecord = async (todo: TodoFrontMatter): Promise<TodoRecord | null> => {
                    const filePath = getTodoPath(todosDir, todo.id);
                    const record = await ensureTodoExists(filePath, todo.id);
                    if (!record) {
                        ctx.ui.notify(`Todo ${formatTodoId(todo.id)} not found`, "error");
                        return null;
                    }
                    return record;
                };
                const openTodoOverlay = async (record: TodoRecord): Promise<TodoOverlayAction> => {
                    const action = await ctx.ui.custom<TodoOverlayAction>((overlayTui, overlayTheme, overlayKb, overlayDone) => new TodoDetailOverlayComponent(overlayTui, overlayTheme, record, overlayDone, overlayKb), {
                        overlay: true,
                        overlayOptions: { anchor: "center", maxHeight: "80%", width: "80%" },
                    });
                    return action ?? "back";
                };
                const applyTodoAction = async (record: TodoRecord, action: TodoMenuAction): Promise<"stay" | "exit"> => {
                    if (action === "refine") {
                        const title = record.title || "(untitled)";
                        nextPrompt = buildRefinePrompt(record.id, title);
                        done(null);
                        return "exit";
                    }
                    if (action === "work") {
                        const title = record.title || "(untitled)";
                        nextPrompt = `work on todo ${formatTodoId(record.id)} "${title}"`;
                        done(null);
                        return "exit";
                    }
                    if (action === "view") {
                        return "stay";
                    }
                    if (action === "copyPath") {
                        copyTodoPathToClipboard(record.id);
                        return "stay";
                    }
                    if (action === "copyText") {
                        copyTodoTextToClipboard(record);
                        return "stay";
                    }
                    if (action === "release") {
                        const result = await releaseTodoAssignment(todosDir, record.id, ctx, true);
                        if ("error" in result) {
                            ctx.ui.notify(result.error, "error");
                            return "stay";
                        }
                        const updatedTodos = await listTodos(todosDir);
                        selector?.setTodos(updatedTodos);
                        ctx.ui.notify(`Released todo ${formatTodoId(record.id)}`, "info");
                        return "stay";
                    }
                    if (action === "delete") {
                        const result = await deleteTodo(todosDir, record.id, ctx);
                        if ("error" in result) {
                            ctx.ui.notify(result.error, "error");
                            return "stay";
                        }
                        const updatedTodos = await listTodos(todosDir);
                        selector?.setTodos(updatedTodos);
                        ctx.ui.notify(`Deleted todo ${formatTodoId(record.id)}`, "info");
                        return "stay";
                    }
                    const nextStatus = action === "close" ? "closed" : "open";
                    const result = await updateTodoStatus(todosDir, record.id, nextStatus, ctx);
                    if ("error" in result) {
                        ctx.ui.notify(result.error, "error");
                        return "stay";
                    }
                    const updatedTodos = await listTodos(todosDir);
                    selector?.setTodos(updatedTodos);
                    ctx.ui.notify(`${action === "close" ? "Closed" : "Reopened"} todo ${formatTodoId(record.id)}`, "info");
                    return "stay";
                };
                const handleActionSelection = async (record: TodoRecord, action: TodoMenuAction) => {
                    if (action === "view") {
                        const overlayAction = await openTodoOverlay(record);
                        if (overlayAction === "work") {
                            await applyTodoAction(record, "work");
                            return;
                        }
                        if (actionMenu) {
                            setActiveComponent(actionMenu);
                        }
                        return;
                    }
                    if (action === "delete") {
                        const message = `Delete todo ${formatTodoId(record.id)}? This cannot be undone.`;
                        deleteConfirm = new TodoDeleteConfirmComponent(theme, message, (confirmed) => {
                            if (!confirmed) {
                                setActiveComponent(actionMenu);
                                return;
                            }
                            void (async () => {
                                await applyTodoAction(record, "delete");
                                setActiveComponent(selector);
                            })();
                        });
                        setActiveComponent(deleteConfirm);
                        return;
                    }
                    const result = await applyTodoAction(record, action);
                    if (result === "stay") {
                        setActiveComponent(selector);
                    }
                };
                const showActionMenu = async (todo: TodoFrontMatter | TodoRecord) => {
                    const record = "body" in todo ? todo : await resolveTodoRecord(todo);
                    if (!record) {
                        return;
                    }
                    actionMenu = new TodoActionMenuComponent(theme, record, (action) => {
                        void handleActionSelection(record, action);
                    }, () => {
                        setActiveComponent(selector);
                    });
                    setActiveComponent(actionMenu);
                };
                const handleSelect = async (todo: TodoFrontMatter) => {
                    await showActionMenu(todo);
                };
                selector = new TodoSelectorComponent(tui, theme, todos, (todo) => {
                    void handleSelect(todo);
                }, () => done(null), searchTerm || undefined, currentSessionId, kb, (todo, action) => {
                    const title = todo.title || "(untitled)";
                    nextPrompt =
                        action === "refine"
                            ? buildRefinePrompt(todo.id, title)
                            : `work on todo ${formatTodoId(todo.id)} "${title}"`;
                    done(null);
                });
                setActiveComponent(selector);
                const rootComponent = {
                    get focused() {
                        return wrapperFocused;
                    },
                    set focused(value: boolean) {
                        wrapperFocused = value;
                        if (activeComponent && "focused" in activeComponent) {
                            activeComponent.focused = value;
                        }
                    },
                    handleInput(data: string) {
                        activeComponent?.handleInput?.(data);
                    },
                    invalidate() {
                        activeComponent?.invalidate();
                    },
                    render(width: number) {
                        return activeComponent ? activeComponent.render(width) : [];
                    },
                };
                return rootComponent;
            });
            if (nextPrompt) {
                ctx.ui.setEditorText(nextPrompt);
                rootTui?.requestRender();
            }
        },
    });
};
export default todosExtension;
