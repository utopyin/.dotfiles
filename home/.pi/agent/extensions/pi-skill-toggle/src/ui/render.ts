import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

export const fit = (text: string, width: number): string => {
	const truncated = truncateToWidth(text, Math.max(0, width));
	const padding = Math.max(0, width - visibleWidth(truncated));
	return `${truncated}${" ".repeat(padding)}`;
};

export const frameLine = (
	theme: Theme,
	content: string,
	innerWidth: number,
): string =>
	`${theme.fg("borderAccent", "│")}${fit(content, innerWidth)}${theme.fg(
		"borderAccent",
		"│",
	)}`;

export const divider = (theme: Theme, innerWidth: number): string =>
	theme.fg("borderMuted", `├${"─".repeat(innerWidth)}┤`);

export const topBorder = (theme: Theme, innerWidth: number): string =>
	theme.fg("borderAccent", `┌${"─".repeat(innerWidth)}┐`);

export const bottomBorder = (theme: Theme, innerWidth: number): string =>
	theme.fg("borderAccent", `└${"─".repeat(innerWidth)}┘`);

export const combineColumns = (
	left: string[],
	right: string[],
	leftWidth: number,
	rightWidth: number,
	sep: string,
): string[] => {
	const rows = Math.max(left.length, right.length);
	const lines: string[] = [];
	for (let index = 0; index < rows; index += 1) {
		lines.push(
			`${fit(left[index] ?? "", leftWidth)}${sep}${fit(
				right[index] ?? "",
				rightWidth,
			)}`,
		);
	}
	return lines;
};
