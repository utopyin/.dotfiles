import { randomUUID } from "node:crypto";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { McpExtensionState } from "./state.js";
import { extractUiPromptText, UI_STREAM_HOST_CONTEXT_KEY, UI_STREAM_REQUEST_META_KEY, UI_STREAM_STRUCTURED_CONTENT_KEY } from './types.js';
import type { UiHostContext, UiMessageParams, UiModelContextParams, UiStreamMode } from './types.js';
import { logger } from "./logger.js";
import { startUiServer } from './ui-server.js';
import type { UiServerHandle } from './ui-server.js';
import { isGlimpseAvailable, openGlimpseWindow } from "./glimpse-ui.js";

let activeGlimpseWindow: {
    close(): void;
} | null = null;
export interface UiSessionRequest {
    serverName: string;
    toolName: string;
    toolArgs: Record<string, unknown>;
    uiResourceUri: string;
    streamMode?: UiStreamMode;
}
export interface UiSessionRuntime {
    serverName: string;
    toolName: string;
    reused: boolean;
    streamId?: string;
    streamToken?: string;
    streamMode?: UiStreamMode;
    requestMeta?: Record<string, unknown>;
    url: string;
    isActive: () => boolean;
    sendToolResult: (result: CallToolResult) => void;
    sendResultPatch: (result: CallToolResult) => void;
    sendToolCancelled: (reason: string) => void;
    close: (reason?: string) => void;
}
const MAX_COMPLETED_SESSIONS = 10;
const withStreamEnvelope = (result: CallToolResult, streamId: string | undefined, sequence: number): CallToolResult => {
    if (!streamId) {
        return result;
    }
    const structuredContent = result.structuredContent && typeof result.structuredContent === "object" && !Array.isArray(result.structuredContent)
        ? { ...result.structuredContent }
        : {};
    const rawEnvelope = structuredContent[UI_STREAM_STRUCTURED_CONTENT_KEY];
    const envelope = rawEnvelope && typeof rawEnvelope === "object" && !Array.isArray(rawEnvelope)
        ? { ...rawEnvelope as Record<string, unknown> }
        : {
            frameType: "final",
            phase: "settled",
            status: result.isError ? "error" : "ok",
        };
    structuredContent[UI_STREAM_STRUCTURED_CONTENT_KEY] = {
        ...envelope,
        sequence,
        streamId,
    };
    return {
        ...result,
        structuredContent,
    };
};
const openInBrowser = async (state: McpExtensionState, url: string): Promise<void> => {
    try {
        await state.openBrowser(url);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        state.ui?.notify(`MCP UI browser open failed: ${message}`, "warning");
        state.ui?.notify(`Open manually: ${url}`, "info");
    }
};
export const maybeStartUiSession = async (state: McpExtensionState, request: UiSessionRequest): Promise<UiSessionRuntime | null> => {
    const log = logger.child({
        component: "UiSession",
        server: request.serverName,
        tool: request.toolName,
    });
    try {
        if (state.uiServer &&
            state.uiServer.serverName === request.serverName &&
            state.uiServer.toolName === request.toolName) {
            const existingHandle = state.uiServer;
            const { streamMode } = request;
            const streamId = streamMode ? randomUUID() : undefined;
            const streamToken = streamMode ? randomUUID() : undefined;
            let active = true;
            let nextStreamSequence = 0;
            const cleanupStreamListener = () => {
                if (streamToken) {
                    state.manager.removeUiStreamListener(streamToken);
                }
            };
            existingHandle.sendToolInput(request.toolArgs);
            if (streamToken) {
                state.manager.registerUiStreamListener(streamToken, (serverName, notification) => {
                    if (!active || state.uiServer !== existingHandle) {
                        return;
                    }
                    if (serverName !== request.serverName) {
                        return;
                    }
                    nextStreamSequence += 1;
                    existingHandle.sendResultPatch(withStreamEnvelope(notification.result as CallToolResult, streamId, nextStreamSequence));
                });
            }
            return {
                close: () => {
                    active = false;
                    cleanupStreamListener();
                },
                isActive: () => active && state.uiServer === existingHandle,
                requestMeta: streamToken ? { [UI_STREAM_REQUEST_META_KEY]: streamToken } : undefined,
                reused: true,
                sendResultPatch: (result: CallToolResult) => {
                    if (!active || state.uiServer !== existingHandle)
                        {return;}
                    nextStreamSequence += 1;
                    existingHandle.sendResultPatch(withStreamEnvelope(result, streamId, nextStreamSequence));
                },
                sendToolCancelled: (reason: string) => {
                    if (!active || state.uiServer !== existingHandle)
                        {return;}
                    nextStreamSequence += 1;
                    existingHandle.sendToolResult(withStreamEnvelope({
                        content: [{ text: reason, type: "text" }],
                        isError: true,
                    }, streamId, nextStreamSequence));
                },
                sendToolResult: (result: CallToolResult) => {
                    if (!active || state.uiServer !== existingHandle)
                        {return;}
                    nextStreamSequence += 1;
                    existingHandle.sendToolResult(withStreamEnvelope(result, streamId, nextStreamSequence));
                },
                serverName: request.serverName,
                streamId,
                streamMode,
                streamToken,
                toolName: request.toolName,
                url: existingHandle.url,
            };
        }
        const resource = await state.uiResourceHandler.readUiResource(request.serverName, request.uiResourceUri);
        if (state.uiServer) {
            state.uiServer.close("replaced");
            state.uiServer = null;
        }
        if (activeGlimpseWindow) {
            activeGlimpseWindow.close();
            activeGlimpseWindow = null;
        }
        const { streamMode } = request;
        const streamId = streamMode ? randomUUID() : undefined;
        const streamToken = streamMode ? randomUUID() : undefined;
        const hostContext: UiHostContext | undefined = streamMode && streamId
            ? {
                [UI_STREAM_HOST_CONTEXT_KEY]: {
                    intermediateResultPatches: streamMode === "stream-first",
                    mode: streamMode,
                    partialInput: false,
                    streamId,
                },
            }
            : undefined;
        let active = true;
        let nextStreamSequence = 0;
        let handle: UiServerHandle | null = null;
        const cleanupStreamListener = () => {
            if (streamToken) {
                state.manager.removeUiStreamListener(streamToken);
            }
        };
        handle = await startUiServer({
            consentManager: state.consentManager,
            hostContext,
            manager: state.manager,
            onComplete: (reason: string) => {
                active = false;
                cleanupStreamListener();
                if (state.uiServer === handle) {
                    const messages = handle.getSessionMessages();
                    const stream = handle.getStreamSummary();
                    const hasContent = messages.prompts.length > 0 ||
                        messages.intents.length > 0 ||
                        messages.notifications.length > 0 ||
                        !!stream;
                    if (hasContent) {
                        state.completedUiSessions.push({
                            completedAt: new Date(),
                            messages,
                            reason,
                            serverName: handle.serverName,
                            stream,
                            toolName: handle.toolName,
                        });
                        while (state.completedUiSessions.length > MAX_COMPLETED_SESSIONS) {
                            state.completedUiSessions.shift();
                        }
                        log.debug("Session completed", {
                            intents: messages.intents.length,
                            notifications: messages.notifications.length,
                            prompts: messages.prompts.length,
                            reason,
                            streamFrames: stream?.frames ?? 0,
                        });
                    }
                    state.uiServer = null;
                    if (activeGlimpseWindow) {
                        activeGlimpseWindow.close();
                        activeGlimpseWindow = null;
                    }
                }
            },
            onContextUpdate: (params: UiModelContextParams) => {
                log.debug("Model context update from UI", {
                    hasContent: !!params.content,
                    hasStructured: !!params.structuredContent,
                });
            },
            onMessage: (params: UiMessageParams) => {
                const prompt = extractUiPromptText(params);
                if (prompt) {
                    if (state.sendMessage) {
                        state.sendMessage({
                            content: [{ text: `User sent prompt from ${request.serverName} UI: "${prompt}"`, type: "text" }],
                            customType: "mcp-ui-prompt",
                            details: { prompt, server: request.serverName, tool: request.toolName },
                            display: true,
                        }, { triggerTurn: true });
                        log.debug("Triggered agent turn for UI prompt", { prompt: prompt.slice(0, 50) });
                    }
                }
                else if (params.type === "intent" || params.intent) {
                    const intent = params.intent ?? "";
                    const intentParams = params.params;
                    if (intent && state.sendMessage) {
                        const paramsStr = intentParams ? ` ${JSON.stringify(intentParams)}` : "";
                        state.sendMessage({
                            content: [{ text: `User triggered intent from ${request.serverName} UI: ${intent}${paramsStr}`, type: "text" }],
                            customType: "mcp-ui-intent",
                            details: { intent, params: intentParams, server: request.serverName, tool: request.toolName },
                            display: true,
                        }, { triggerTurn: true });
                        log.debug("Triggered agent turn for UI intent", { intent });
                    }
                }
                else if (params.type === "notify" || params.message) {
                    const text = params.message ?? "";
                    if (text && state.ui) {
                        state.ui.notify(`[${request.serverName}] ${text}`, "info");
                    }
                }
            },
            resource,
            serverName: request.serverName,
            toolArgs: streamMode === "stream-first" ? {} : request.toolArgs,
            toolName: request.toolName,
        });
        if (streamToken) {
            state.manager.registerUiStreamListener(streamToken, (serverName, notification) => {
                if (!active || state.uiServer !== handle) {
                    return;
                }
                if (serverName !== request.serverName) {
                    return;
                }
                nextStreamSequence += 1;
                handle.sendResultPatch(withStreamEnvelope(notification.result as CallToolResult, streamId, nextStreamSequence));
            });
        }
        state.uiServer = handle;
        const glimpseDetected = isGlimpseAvailable();
        const viewerPref = process.env.MCP_UI_VIEWER?.toLowerCase();
        const useGlimpse = viewerPref === "glimpse" ||
            (viewerPref !== "browser" && glimpseDetected);
        if (useGlimpse) {
            try {
                const glimpseHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;padding:0;width:100vw;height:100vh;overflow:hidden}iframe{width:100%;height:100%;border:none}</style></head><body><iframe src="${handle.url}"></iframe></body></html>`;
                activeGlimpseWindow = await openGlimpseWindow(glimpseHtml, {
                    height: 800,
                    onClosed: () => {
                        if (active)
                            {handle.close("glimpse-closed");}
                    },
                    title: `MCP · ${request.serverName} · ${request.toolName}`,
                    width: 1000,
                });
            }
            catch (error) {
                log.debug("Glimpse unavailable, using browser", {
                    error: error instanceof Error ? error.message : String(error),
                });
                await openInBrowser(state, handle.url);
            }
        }
        else {
            await openInBrowser(state, handle.url);
        }
        return {
            close: (reason?: string) => {
                active = false;
                cleanupStreamListener();
                handle.close(reason);
            },
            isActive: () => active && state.uiServer === handle,
            requestMeta: streamToken ? { [UI_STREAM_REQUEST_META_KEY]: streamToken } : undefined,
            reused: false,
            sendResultPatch: (result: CallToolResult) => {
                if (!active || state.uiServer !== handle)
                    {return;}
                nextStreamSequence += 1;
                handle.sendResultPatch(withStreamEnvelope(result, streamId, nextStreamSequence));
            },
            sendToolCancelled: (reason: string) => {
                if (!active || state.uiServer !== handle)
                    {return;}
                handle.sendToolCancelled(reason);
            },
            sendToolResult: (result: CallToolResult) => {
                if (!active || state.uiServer !== handle)
                    {return;}
                nextStreamSequence += 1;
                handle.sendToolResult(withStreamEnvelope(result, streamId, nextStreamSequence));
            },
            serverName: request.serverName,
            streamId,
            streamMode,
            streamToken,
            toolName: request.toolName,
            url: handle.url,
        };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.error("Failed to start UI session", error instanceof Error ? error : undefined);
        state.ui?.notify(`MCP UI unavailable for ${request.toolName} (${request.serverName}): ${message}`, "warning");
        return null;
    }
};
