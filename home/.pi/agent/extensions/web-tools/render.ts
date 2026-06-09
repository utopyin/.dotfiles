import { keyHint } from "@earendil-works/pi-coding-agent";
import type { Theme } from "@earendil-works/pi-coding-agent";

interface TextContentLike {
	text?: string;
	type: string;
}

type RenderTheme = Pick<Theme, "fg">;

export const getTextContent = (
	content: TextContentLike[] | undefined,
): string => {
	if (content) {
		return content
			.filter(
				(item): item is { text: string; type: "text" } =>
					item.type === "text" && typeof item.text === "string",
			)
			.map((item) => item.text)
			.join("\n");
	}
	return "";
};

export const appendExpandedPreview = (
	base: string,
	text: string,
	theme: RenderTheme,
	options: { maxColumns?: number; maxLines?: number } = {},
): string => {
	const maxColumns = options.maxColumns ?? 200;
	const maxLines = options.maxLines ?? 12;
	const lines = text.split("\n");
	const preview = lines
		.slice(0, maxLines)
		.map((line) => theme.fg("dim", line.slice(0, maxColumns)));
	const ellipsis = lines.length > maxLines ? [theme.fg("muted", "...")] : [];
	return [base, ...preview, ...ellipsis].join("\n");
};

export const appendExpandHint = (base: string, expanded: boolean): string => {
	if (expanded) {
		return base;
	}
	return `${base} ${keyHint("app.tools.expand", "for details")}`;
};
