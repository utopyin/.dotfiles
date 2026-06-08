import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";

import {
	findAssistantMessageByEntryId,
	getLastAssistantMessageSnapshot,
	getRecentAssistantMessages,
	hasSessionMovedPastEntry,
} from "/Users/utopy/.pi/agent/npm/node_modules/@plannotator/pi-extension/assistant-message.ts";
import { parseAnnotateArgs } from "/Users/utopy/.pi/agent/npm/node_modules/@plannotator/pi-extension/generated/annotate-args.ts";
import { loadConfig } from "/Users/utopy/.pi/agent/npm/node_modules/@plannotator/pi-extension/generated/config.ts";
import { getAnnotateMessageFeedbackPrompt } from "/Users/utopy/.pi/agent/npm/node_modules/@plannotator/pi-extension/generated/prompts.ts";
import {
	getPiSessionIdentity,
	isCurrentPiSessionDifferentFrom,
	notifyCurrentPiSession,
	registerCurrentPiSession,
	sendUserMessageToCurrentPiSession,
	type PiSessionIdentity,
	withCurrentPiSessionFallbackHeader,
} from "/Users/utopy/.pi/agent/npm/node_modules/@plannotator/pi-extension/current-pi-session.ts";
import {
	getStartupErrorMessage,
	hasPlanBrowserHtml,
	startLastMessageAnnotationSession,
} from "/Users/utopy/.pi/agent/npm/node_modules/@plannotator/pi-extension/plannotator-events.ts";

const COMMAND_NAME = "plannotator-last";

function excerptText(text: string, maxChars = 1000): string {
	const trimmed = text.trim();
	if (trimmed.length <= maxChars) return trimmed;
	return `${trimmed.slice(0, maxChars).trimEnd()}...`;
}

function blockquote(text: string): string {
	return text
		.split("\n")
		.map((line) => `> ${line}`)
		.join("\n");
}

function anchorMessageFeedback(feedback: string, originalMessage: string): string {
	return `This feedback applies to the earlier assistant response excerpted below:

${blockquote(excerptText(originalMessage))}

User feedback:
${feedback}`;
}

function safeNotify(
	ctx: ExtensionContext,
	message: string,
	type: "info" | "warning" | "error" = "info",
	origin?: PiSessionIdentity,
): void {
	try {
		ctx.ui.notify(message, type);
	} catch (err) {
		if (notifyCurrentPiSession(message, type, origin)) return;
		console.error(
			`Plannotator notification failed: ${
				err instanceof Error ? err.message : String(err)
			}`,
		);
	}
}

function reportBackgroundError(
	ctx: ExtensionContext,
	message: string,
	err: unknown,
	origin?: PiSessionIdentity,
): void {
	const detail = getStartupErrorMessage(err);
	console.error(`${message}: ${detail}`);
	safeNotify(ctx, `${message}: ${detail}`, "error", origin);
}

function shouldAnchorLastMessageFeedback(
	ctx: ExtensionContext,
	entryId: string,
	origin: PiSessionIdentity,
): boolean {
	if (isCurrentPiSessionDifferentFrom(origin)) return true;
	try {
		return hasSessionMovedPastEntry(ctx, entryId);
	} catch {
		return true;
	}
}

function reportCurrentSessionSendFailure(
	errorMessage: string,
	err: unknown,
	origin: PiSessionIdentity,
): void {
	const detail = getStartupErrorMessage(err);
	console.error(`${errorMessage}: ${detail}`);
	notifyCurrentPiSession(`${errorMessage}: ${detail}`, "error", origin);
}

function trySendUserMessageToDifferentCurrentSession(
	content: Parameters<ExtensionAPI["sendUserMessage"]>[0],
	options: Parameters<ExtensionAPI["sendUserMessage"]>[1],
	errorMessage: string,
	origin: PiSessionIdentity,
): boolean {
	const result = sendUserMessageToCurrentPiSession(
		withCurrentPiSessionFallbackHeader(content),
		options,
		origin,
	);
	if (result.ok) return true;
	if (result.reason === "send-failed") {
		reportCurrentSessionSendFailure(errorMessage, result.error, origin);
		return true;
	}
	return false;
}

function sendUserMessageWithCurrentSessionFallback(
	pi: ExtensionAPI,
	content: Parameters<ExtensionAPI["sendUserMessage"]>[0],
	options: Parameters<ExtensionAPI["sendUserMessage"]>[1],
	errorMessage: string,
	origin: PiSessionIdentity,
): void {
	if (
		trySendUserMessageToDifferentCurrentSession(
			content,
			options,
			errorMessage,
			origin,
		)
	) {
		return;
	}

	try {
		pi.sendUserMessage(content, options);
		return;
	} catch (err) {
		if (
			trySendUserMessageToDifferentCurrentSession(
				content,
				options,
				errorMessage,
				origin,
			)
		) {
			return;
		}
		throw err;
	}
}

async function openLastAssistantMessageAnnotation(
	pi: ExtensionAPI,
	args: string,
	ctx: ExtensionContext,
): Promise<void> {
	const { gate } = parseAnnotateArgs(args);

	if (!hasPlanBrowserHtml()) {
		ctx.ui.notify(
			"Annotation UI not available. Run 'bun run build' in the pi-extension directory.",
			"error",
		);
		return;
	}

	const origin = getPiSessionIdentity(ctx);
	const snapshot = getLastAssistantMessageSnapshot(ctx);
	if (!snapshot) {
		ctx.ui.notify("No assistant message found in session.", "error");
		return;
	}

	const recent = getRecentAssistantMessages(ctx, 25);
	const pickerMessages = recent.length > 1 ? recent : undefined;

	ctx.ui.notify("Opening annotation UI for last message...", "info");

	try {
		const session = await startLastMessageAnnotationSession(
			ctx,
			snapshot.text,
			gate,
			pickerMessages,
		);
		ctx.ui.notify(
			"Last-message annotation opened. You can keep chatting while it runs.",
			"info",
		);
		void session
			.waitForDecision()
			.then((result) => {
				try {
					if (result.exit) {
						safeNotify(ctx, "Annotation session closed.", "info", origin);
						return;
					}
					if (result.approved) {
						safeNotify(ctx, "Message approved.", "info", origin);
						return;
					}
					if (!result.feedback) {
						safeNotify(ctx, "Annotation closed (no feedback).", "info", origin);
						return;
					}

					const target =
						result.selectedMessageId && result.selectedMessageId !== snapshot.entryId
							? findAssistantMessageByEntryId(ctx, result.selectedMessageId) ?? snapshot
							: snapshot;
					const feedback =
						result.feedbackScope !== "messages" &&
						shouldAnchorLastMessageFeedback(ctx, target.entryId, origin)
							? anchorMessageFeedback(result.feedback, target.text)
							: result.feedback;

					sendUserMessageWithCurrentSessionFallback(
						pi,
						getAnnotateMessageFeedbackPrompt("pi", loadConfig(), { feedback }),
						{ deliverAs: "followUp" },
						"Plannotator message annotation feedback could not be sent",
						origin,
					);
				} catch (err) {
					reportBackgroundError(
						ctx,
						"Plannotator message annotation feedback could not be sent",
						err,
						origin,
					);
				}
			})
			.catch((err) => {
				reportBackgroundError(
					ctx,
					"Plannotator message annotation session failed",
					err,
					origin,
				);
			});
	} catch (err) {
		ctx.ui.notify(
			`Failed to start annotation UI: ${getStartupErrorMessage(err)}`,
			"error",
		);
	}
}

export default function plannotatorLastShortcut(pi: ExtensionAPI) {
	const currentPiSession = registerCurrentPiSession(pi);

	pi.on("session_start", (_event, ctx) => {
		currentPiSession.update(ctx);
	});

	pi.on("session_shutdown", () => {
		currentPiSession.clear();
	});

	pi.registerShortcut("alt+o", {
		description: "Annotate the last assistant message with Plannotator",
		handler: async (ctx) => {
			const hasPlannotatorLast = pi
				.getCommands()
				.some((command) => command.name === COMMAND_NAME);

			if (!hasPlannotatorLast) {
				ctx.ui.notify(`/${COMMAND_NAME} is not loaded.`, "error");
				return;
			}

			await openLastAssistantMessageAnnotation(pi, "", ctx);
		},
	});
}
