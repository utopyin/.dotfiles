import type {
	ExtensionAPI,
	SessionEntry,
	SessionMessageEntry,
} from "@earendil-works/pi-coding-agent";

const getUserMessageText = (entry: SessionMessageEntry): string => {
	const { content } = entry.message;
	if (typeof content === "string") {
		return content;
	}

	return content
		.filter((block): block is { type: "text"; text: string } =>
			block.type === "text",
		)
		.map((block) => block.text)
		.join("");
};

const findLatestUserMessage = (
	branch: readonly SessionEntry[],
): SessionMessageEntry | undefined => {
	for (let index = branch.length - 1; index >= 0; index -= 1) {
		const entry = branch[index];
		if (
			entry?.type === "message" &&
			"role" in entry.message &&
			entry.message.role === "user"
		) {
			return entry;
		}
	}
	return undefined;
};

export default function editLatestUserMessage(pi: ExtensionAPI) {
	pi.registerShortcut("alt+e", {
		description: "Edit the latest user message",
		handler: (ctx) => {
			if (!ctx.isIdle()) {
				ctx.ui.notify(
					"/edit can only run while pi is idle. Press Escape to abort, then press Alt+E again.",
					"warning",
				);
				return;
			}

			const existingText = ctx.ui.getEditorText().trim();
			if (existingText && existingText !== "/edit") {
				ctx.ui.notify("Editor is not empty; not replacing it with /edit.", "warning");
				return;
			}

			ctx.ui.setEditorText("/edit");
			setTimeout(() => process.stdin.emit("data", "\r"), 0);
		},
	});

	pi.registerCommand("edit", {
		description: "Edit the latest user message without summarizing the branch",
		handler: async (_args, ctx) => {
			if (!ctx.isIdle()) {
				ctx.ui.notify(
					"/edit can only run while pi is idle. Press Escape to abort, then run /edit again.",
					"warning",
				);
				return;
			}

			const latestUserMessage = findLatestUserMessage(
				ctx.sessionManager.getBranch(),
			);
			if (!latestUserMessage) {
				ctx.ui.notify("No user message found to edit.", "warning");
				return;
			}

			const editorText = getUserMessageText(latestUserMessage);
			if (!editorText.trim()) {
				ctx.ui.notify("Latest user message has no editable text.", "warning");
				return;
			}

			const targetId = latestUserMessage.parentId ?? latestUserMessage.id;
			const result = await ctx.navigateTree(targetId, { summarize: false });
			if (result.cancelled) {
				ctx.ui.notify("Edit cancelled.", "info");
				return;
			}

			ctx.ui.setEditorText(editorText);
			ctx.ui.notify("Latest user message loaded for editing.", "info");
		},
	});
}
