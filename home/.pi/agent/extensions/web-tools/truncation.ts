import {
	DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES,
	formatSize,
	truncateHead,
} from "@earendil-works/pi-coding-agent";
import type { TruncationResult } from "@earendil-works/pi-coding-agent";
import { writeTempTextFile } from "./temp.ts";

export interface TruncatedTextOutput {
	fullOutputPath?: string;
	text: string;
	truncated: boolean;
	truncation: TruncationResult;
}

export const truncateTextOutput = async (
	output: string,
	options: {
		fileName?: string;
		maxBytes?: number;
		maxLines?: number;
		tempPrefix: string;
	},
): Promise<TruncatedTextOutput> => {
	const truncation = truncateHead(output, {
		maxBytes: options.maxBytes ?? DEFAULT_MAX_BYTES,
		maxLines: options.maxLines ?? DEFAULT_MAX_LINES,
	});

	if (truncation.truncated) {
		const fullOutputPath = await writeTempTextFile(
			options.tempPrefix,
			options.fileName ?? "output.txt",
			output,
		);
		const omittedBytes = truncation.totalBytes - truncation.outputBytes;
		const omittedLines = truncation.totalLines - truncation.outputLines;
		let text = truncation.content;
		text += `\n\n[Output truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines`;
		text += ` (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}).`;
		text += ` ${omittedLines} lines (${formatSize(omittedBytes)}) omitted.`;
		text += ` Full output saved to: ${fullOutputPath}]`;

		return {
			fullOutputPath,
			text,
			truncated: true,
			truncation,
		};
	}

	return {
		text: truncation.content,
		truncated: false,
		truncation,
	};
};
