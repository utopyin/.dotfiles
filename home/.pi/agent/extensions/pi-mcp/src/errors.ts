import type { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
/**
 * Custom error types for MCP operations.
 * Provides structured errors with context and recovery hints.
 */
import type { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
// ── Auth Errors ────────────────────────────────────────────────────────────
/**
 * Thrown when an MCP server requires OAuth authentication.
 * Carries the pending transport so callers can complete auth via finishAuth().
 */
export class NeedsAuthError extends Error {
  readonly serverName: string;
  readonly transport: StreamableHTTPClientTransport | SSEClientTransport;
  constructor(
    serverName: string,
    transport: StreamableHTTPClientTransport | SSEClientTransport,
    message?: string
  ) {
    super(
      message ?? `MCP server "${serverName}" requires OAuth authentication`
    );
    this.name = "NeedsAuthError";
    this.serverName = serverName;
    this.transport = transport;
  }
}
/**
 * Thrown when an MCP server requires a pre-registered OAuth client ID
 * (dynamic registration is not supported by the server).
 */
export class NeedsClientRegistrationError extends Error {
  readonly serverName: string;
  constructor(serverName: string, message?: string) {
    super(
      message ??
        `MCP server "${serverName}" requires a pre-registered client ID`
    );
    this.name = "NeedsClientRegistrationError";
    this.serverName = serverName;
  }
}
// ── UI Errors ──────────────────────────────────────────────────────────────
export interface McpUiErrorContext {
  server?: string;
  tool?: string;
  uri?: string;
  session?: string;
  [key: string]: unknown;
}
/**
 * Base error class for MCP UI errors.
 */
export class McpUiError extends Error {
  readonly code: string;
  readonly context: McpUiErrorContext;
  readonly recoveryHint?: string;
  readonly cause?: Error;
  constructor(
    message: string,
    options: {
      code: string;
      context?: McpUiErrorContext;
      recoveryHint?: string;
      cause?: Error;
    }
  ) {
    super(message);
    this.name = "McpUiError";
    this.code = options.code;
    this.context = options.context ?? {};
    this.recoveryHint = options.recoveryHint;
    this.cause = options.cause;
  }
  toJSON(): Record<string, unknown> {
    return {
      code: this.code,
      context: this.context,
      message: this.message,
      name: this.name,
      recoveryHint: this.recoveryHint,
      stack: this.stack,
    };
  }
}
/**
 * Error fetching a UI resource from the MCP server.
 */
export class ResourceFetchError extends McpUiError {
  constructor(
    uri: string,
    reason: string,
    options?: {
      server?: string;
      cause?: Error;
    }
  ) {
    super(`Failed to fetch UI resource "${uri}": ${reason}`, {
      cause: options?.cause,
      code: "RESOURCE_FETCH_ERROR",
      context: { server: options?.server, uri },
      recoveryHint:
        "Check that the MCP server is connected and the resource URI is valid.",
    });
    this.name = "ResourceFetchError";
  }
}
/**
 * Error parsing or validating UI resource content.
 */
export class ResourceParseError extends McpUiError {
  constructor(
    uri: string,
    reason: string,
    options?: {
      server?: string;
      mimeType?: string;
    }
  ) {
    super(`Invalid UI resource "${uri}": ${reason}`, {
      code: "RESOURCE_PARSE_ERROR",
      context: { mimeType: options?.mimeType, server: options?.server, uri },
      recoveryHint:
        "Ensure the resource returns valid HTML with the correct MIME type.",
    });
    this.name = "ResourceParseError";
  }
}
/**
 * Error connecting to the AppBridge.
 */
export class BridgeConnectionError extends McpUiError {
  constructor(
    reason: string,
    options?: {
      session?: string;
      cause?: Error;
    }
  ) {
    super(`AppBridge connection failed: ${reason}`, {
      cause: options?.cause,
      code: "BRIDGE_CONNECTION_ERROR",
      context: { session: options?.session },
      recoveryHint:
        "Check browser console for detailed errors. The iframe may have failed to load.",
    });
    this.name = "BridgeConnectionError";
  }
}
/**
 * Error related to user consent for tool calls.
 */
export class ConsentError extends McpUiError {
  readonly denied: boolean;
  constructor(
    server: string,
    options: {
      denied?: boolean;
      requiresApproval?: boolean;
    }
  ) {
    const message = options.denied
      ? `Tool calls for "${server}" were denied for this session`
      : `Tool call approval required for "${server}"`;
    super(message, {
      code: options.denied ? "CONSENT_DENIED" : "CONSENT_REQUIRED",
      context: { server },
      recoveryHint: options.denied
        ? "The user denied tool access. Start a new session to try again."
        : "Prompt the user for consent before calling tools.",
    });
    this.name = "ConsentError";
    this.denied = options.denied ?? false;
  }
}
/**
 * Error with UI server session management.
 */
export class SessionError extends McpUiError {
  constructor(
    reason: string,
    options?: {
      session?: string;
      cause?: Error;
    }
  ) {
    super(`Session error: ${reason}`, {
      cause: options?.cause,
      code: "SESSION_ERROR",
      context: { session: options?.session },
      recoveryHint:
        "The session may have expired or been closed. Try opening the UI again.",
    });
    this.name = "SessionError";
  }
}
/**
 * Error starting or operating the UI server.
 */
export class ServerError extends McpUiError {
  constructor(
    reason: string,
    options?: {
      port?: number;
      cause?: Error;
    }
  ) {
    super(`UI server error: ${reason}`, {
      cause: options?.cause,
      code: "SERVER_ERROR",
      context: { port: options?.port },
      recoveryHint:
        "Check if the port is available. Another process may be using it.",
    });
    this.name = "ServerError";
  }
}
/**
 * Error communicating with the MCP server.
 */
export class McpServerError extends McpUiError {
  constructor(
    server: string,
    reason: string,
    options?: {
      tool?: string;
      cause?: Error;
    }
  ) {
    super(`MCP server "${server}" error: ${reason}`, {
      cause: options?.cause,
      code: "MCP_SERVER_ERROR",
      context: { server, tool: options?.tool },
      recoveryHint: "Check that the MCP server is running and responsive.",
    });
    this.name = "McpServerError";
  }
}
/**
 * Wrap an unknown error into an McpUiError.
 */
export const wrapError = (
  error: unknown,
  context?: McpUiErrorContext
): McpUiError => {
  if (error instanceof McpUiError) {
    // Merge contexts
    return new McpUiError(error.message, {
      cause: error.cause,
      code: error.code,
      context: { ...error.context, ...context },
      recoveryHint: error.recoveryHint,
    });
  }
  const cause = error instanceof Error ? error : undefined;
  const message = error instanceof Error ? error.message : String(error);
  return new McpUiError(message, {
    cause,
    code: "UNKNOWN_ERROR",
    context,
  });
};
/**
 * Check if an error is a specific MCP UI error type.
 */
export const isErrorCode = (error: unknown, code: string): boolean =>
  error instanceof McpUiError && error.code === code;
