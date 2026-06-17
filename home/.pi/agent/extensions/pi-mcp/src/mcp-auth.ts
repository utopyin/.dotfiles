// mcp-auth.ts — Credential storage for MCP OAuth
// Stores tokens, client info, PKCE verifiers, and OAuth state
// Location: ~/.local/share/pi/mcp-auth.json (mode 0o600)
import { randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

// ── Types ──────────────────────────────────────────────────────────────────
export interface McpAuthTokens {
  accessToken: string;
  refreshToken?: string;
  // Absolute timestamp in seconds.
  expiresAt?: number;
  scope?: string;
}
export interface McpAuthClientInfo {
  clientId: string;
  clientSecret?: string;
  clientIdIssuedAt?: number;
  clientSecretExpiresAt?: number;
}
export interface McpAuthEntry {
  tokens?: McpAuthTokens;
  clientInfo?: McpAuthClientInfo;
  codeVerifier?: string;
  oauthState?: string;
  // URL these credentials are scoped to.
  serverUrl?: string;
}
const getDataDir = (): string => {
  // Always use ~/.local/share/pi regardless of platform.
  // XDG_DATA_HOME is respected if set.
  const xdg = process.env.XDG_DATA_HOME;
  if (xdg) {
    return join(xdg, "pi");
  }
  return join(homedir(), ".local", "share", "pi");
};
const AUTH_FILE = join(getDataDir(), "mcp-auth.json");
const readAll = (): Record<string, McpAuthEntry> => {
  try {
    if (!existsSync(AUTH_FILE)) {
      return {};
    }
    const raw = readFileSync(AUTH_FILE, "utf-8");
    const data = JSON.parse(raw);
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
      return {};
    }
    return data as Record<string, McpAuthEntry>;
  } catch {
    return {};
  }
};
const writeAll = (data: Record<string, McpAuthEntry>): void => {
  const dir = dirname(AUTH_FILE);
  mkdirSync(dir, { recursive: true });
  // Atomic write: write to temp file then rename to prevent corruption
  // from partial writes (e.g. crash, concurrent access).
  const tmp = `${AUTH_FILE}.${randomBytes(6).toString("hex")}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  renameSync(tmp, AUTH_FILE);
};
// ── Public API ─────────────────────────────────────────────────────────────
const get = (serverName: string): McpAuthEntry | undefined => {
  const data = readAll();
  return data[serverName];
};
/**
 * Get auth entry and validate it's for the correct URL.
 * Returns undefined if URL has changed (credentials are invalid).
 */
const getForUrl = (
  serverName: string,
  serverUrl: string
): McpAuthEntry | undefined => {
  const entry = get(serverName);
  if (!entry) {
    return undefined;
  }
  // No serverUrl stored → old/invalid entry
  if (!entry.serverUrl) {
    return undefined;
  }
  // URL changed → credentials invalid
  if (entry.serverUrl !== serverUrl) {
    return undefined;
  }
  return entry;
};
const set = (
  serverName: string,
  entry: McpAuthEntry,
  serverUrl?: string
): void => {
  const data = readAll();
  if (serverUrl) {
    entry.serverUrl = serverUrl;
  }
  data[serverName] = entry;
  writeAll(data);
};
const remove = (serverName: string): void => {
  const data = readAll();
  const { [serverName]: _removed, ...nextData } = data;
  writeAll(nextData);
};
const updateTokens = (
  serverName: string,
  tokens: McpAuthTokens,
  serverUrl?: string
): void => {
  const entry = get(serverName) ?? {};
  entry.tokens = tokens;
  set(serverName, entry, serverUrl);
};
const updateClientInfo = (
  serverName: string,
  clientInfo: McpAuthClientInfo,
  serverUrl?: string
): void => {
  const entry = get(serverName) ?? {};
  entry.clientInfo = clientInfo;
  set(serverName, entry, serverUrl);
};
const updateCodeVerifier = (serverName: string, codeVerifier: string): void => {
  const entry = get(serverName) ?? {};
  entry.codeVerifier = codeVerifier;
  set(serverName, entry);
};
const clearCodeVerifier = (serverName: string): void => {
  const entry = get(serverName);
  if (entry) {
    delete entry.codeVerifier;
    set(serverName, entry);
  }
};
const updateOAuthState = (serverName: string, oauthState: string): void => {
  const entry = get(serverName) ?? {};
  entry.oauthState = oauthState;
  set(serverName, entry);
};
const getOAuthState = (serverName: string): string | undefined => {
  const entry = get(serverName);
  return entry?.oauthState;
};
const clearOAuthState = (serverName: string): void => {
  const entry = get(serverName);
  if (entry) {
    delete entry.oauthState;
    set(serverName, entry);
  }
};
/**
 * Check if stored tokens are expired.
 * Returns null if no tokens exist, false if no expiry or not expired, true if expired.
 */
const isTokenExpired = (serverName: string): boolean | null => {
  const entry = get(serverName);
  if (!entry?.tokens) {
    return null;
  }
  if (!entry.tokens.expiresAt) {
    return false;
  }
  return entry.tokens.expiresAt < Date.now() / 1000;
};
/**
 * Get auth status for display purposes.
 */
const getAuthStatus = (
  serverName: string
): "authenticated" | "expired" | "not_authenticated" => {
  const entry = get(serverName);
  if (!entry?.tokens) {
    return "not_authenticated";
  }
  const expired = isTokenExpired(serverName);
  return expired ? "expired" : "authenticated";
};
/**
 * Get the storage file path (for debug/status display).
 */
const getStoragePath = (): string => AUTH_FILE;

export const McpAuth = {
  clearCodeVerifier,
  clearOAuthState,
  get,
  getAuthStatus,
  getForUrl,
  getOAuthState,
  getStoragePath,
  isTokenExpired,
  remove,
  set,
  updateClientInfo,
  updateCodeVerifier,
  updateOAuthState,
  updateTokens,
};
