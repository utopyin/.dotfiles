import { decodeTextBuffer, parseContentType, readBodyWithLimit } from "../network.ts";
import type { NormalizedSearchResult } from "../types.ts";
import type { SearchProvider, SearchRequest } from "./types.ts";

const DEFAULT_CONTEXT_MAX_CHARACTERS = 2000;
const MAX_SEARCH_RESPONSE_BYTES = 1 * 1024 * 1024;
const EMPTY_METADATA_VALUES = new Set([
	"n/a",
	"na",
	"none",
	"null",
	"undefined",
	"unknown",
]);

interface ExaContentItem {
	text?: string;
	type?: string;
}

interface ExaEventPayload {
	result?: {
		content?: ExaContentItem[];
		isError?: boolean;
	};
}

interface ExaMessage {
	isError: boolean;
	text: string;
}

interface SearchSectionState {
	inText: boolean;
	publishedAt?: string;
	score?: number;
	snippetLines: string[];
	source?: string;
	title: string;
	url: string;
}

export class ExaSearchProvider implements SearchProvider {
	readonly name = "exa" as const;
	private readonly endpoint: string;

	constructor(endpoint: string) {
		this.endpoint = endpoint;
	}

	async search(
		input: SearchRequest,
		signal?: AbortSignal,
	): Promise<NormalizedSearchResult[]> {
		const response = await this.fetchSearch(input, signal);
		assertSearchResponseSize(response);

		const parsedContentType = parseContentType(response.headers.get("content-type"));
		const { buffer } = await readBodyWithLimit(
			response,
			MAX_SEARCH_RESPONSE_BYTES,
			signal,
		);
		const { text: responseText } = decodeTextBuffer(
			buffer,
			parsedContentType.charset,
		);
		const contentType = parsedContentType.contentType || parsedContentType.mime;
		const providerError = extractSearchErrorFromResponse(responseText, contentType);
		if (providerError) {
			throw new Error(providerError);
		}

		const searchText = extractSearchTextFromResponse(responseText, contentType);
		const results = parseExaSearchText(searchText);

		if (results.length === 0 && !isExplicitNoResultsText(searchText)) {
			throw new Error("Search provider returned an unrecognized response format");
		}

		return results.slice(0, input.maxResults);
	}

	private async fetchSearch(
		input: SearchRequest,
		signal?: AbortSignal,
	): Promise<Response> {
		const response = await fetch(this.endpoint, {
			body: JSON.stringify({
				id: 1,
				jsonrpc: "2.0",
				method: "tools/call",
				params: {
					arguments: {
						contextMaxCharacters: DEFAULT_CONTEXT_MAX_CHARACTERS,
						livecrawl: "fallback",
						numResults: input.maxResults,
						query: input.query,
						type: normalizeExaDepth(input.depth),
					},
					name: "web_search_exa",
				},
			}),
			headers: {
				accept: "application/json, text/event-stream",
				"content-type": "application/json",
			},
			method: "POST",
			signal,
		});

		if (response.ok) {
			return response;
		}

		const body = await response.text();
		throw new Error(
			`Search request failed (${response.status}): ${body || response.statusText}`,
		);
	}
}

// Exa MCP currently accepts only "auto" and "fast". Keep "deep" as a caller-facing
// compatibility alias so existing prompts and docs continue to work.
export const normalizeExaDepth = (
	depth: SearchRequest["depth"],
): Exclude<SearchRequest["depth"], "deep"> => (depth === "deep" ? "fast" : depth);

export const extractSearchTextFromResponse = (
	body: string,
	contentType: string,
): string =>
	extractSearchMessagesFromResponse(body, contentType)
		.filter((message) => message.isError === false)
		.map((message) => message.text)
		.join("\n\n")
		.trim();

export const extractSearchErrorFromResponse = (
	body: string,
	contentType: string,
): string | undefined => {
	const text = extractSearchMessagesFromResponse(body, contentType)
		.filter((message) => message.isError)
		.map((message) => message.text)
		.join("\n\n")
		.trim();
	if (text.length > 0) {
		return text;
	}
};

export const parseSseDataLines = (input: string): string[] => {
	const lines = input.replaceAll("\r\n", "\n").split("\n");
	const chunks: string[] = [];
	let current: string[] = [];

	for (const line of lines) {
		if (line.startsWith("data:")) {
			current.push(line.slice(5).trim());
			continue;
		}
		if (line.trim().length === 0 && current.length > 0) {
			chunks.push(current.join("\n"));
			current = [];
		}
	}

	if (current.length > 0) {
		chunks.push(current.join("\n"));
	}

	return chunks.filter((chunk) => chunk.length > 0);
};

export const parseExaSearchText = (input: string): NormalizedSearchResult[] => {
	const trimmed = input.replaceAll("\r\n", "\n").trim();
	if (trimmed.length === 0) {
		return [];
	}

	const sections = splitSearchSections(trimmed);
	return sections
		.map(parseSearchSection)
		.filter((result): result is NormalizedSearchResult =>
			Boolean(result && result.url),
		);
};

const assertSearchResponseSize = (response: Response): void => {
	const contentLength = response.headers.get("content-length");
	if (contentLength) {
		const declaredBytes = Number.parseInt(contentLength, 10);
		if (
			Number.isFinite(declaredBytes) &&
			declaredBytes > MAX_SEARCH_RESPONSE_BYTES
		) {
			throw new Error(
				`Search response too large (exceeds ${Math.floor(MAX_SEARCH_RESPONSE_BYTES / (1024 * 1024))}MB limit)`,
			);
		}
	}
};

const extractSearchMessagesFromResponse = (
	body: string,
	contentType: string,
): ExaMessage[] => {
	const normalizedContentType = contentType.toLowerCase();
	if (normalizedContentType.includes("text/event-stream") || body.includes("\ndata:")) {
		return parseSseDataLines(body).flatMap(parseSearchMessagesChunk);
	}

	try {
		return payloadToMessages(JSON.parse(body) as ExaEventPayload);
	} catch {
		const text = body.trim();
		return text ? [{ isError: false, text }] : [];
	}
};

const parseSearchMessagesChunk = (chunk: string): ExaMessage[] => {
	try {
		return payloadToMessages(JSON.parse(chunk) as ExaEventPayload);
	} catch {
		return [];
	}
};

const payloadToMessages = (payload: ExaEventPayload): ExaMessage[] => {
	const isError = Boolean(payload.result?.isError);
	return (payload.result?.content ?? [])
		.filter(
			(item): item is { text: string; type: "text" } =>
				item.type === "text" && typeof item.text === "string",
		)
		.map((item) => item.text.trim())
		.filter((text) => text.length > 0)
		.map((text) => ({ isError, text }));
};

const splitSearchSections = (input: string): string[] => {
	const lines = input.split("\n");
	const sections: string[] = [];
	let current: string[] = [];
	let sawUrlOrText = false;

	for (const line of lines) {
		if (line.startsWith("Title: ") && current.length > 0 && sawUrlOrText) {
			sections.push(current.join("\n").trim());
			current = [line];
			sawUrlOrText = false;
			continue;
		}
		if (isSectionContentLine(line)) {
			sawUrlOrText = true;
		}
		current.push(line);
	}

	if (current.length > 0) {
		sections.push(current.join("\n").trim());
	}

	return sections.filter((section) => section.length > 0);
};

const isSectionContentLine = (line: string): boolean =>
	line.startsWith("Highlights:") ||
	line.startsWith("Text:") ||
	line.startsWith("URL: ");

const parseSearchSection = (
	section: string,
): NormalizedSearchResult | undefined => {
	const state: SearchSectionState = {
		inText: false,
		snippetLines: [],
		title: "",
		url: "",
	};

	for (const line of section.split("\n")) {
		applySearchSectionLine(state, line);
	}

	if (state.url.length === 0) {
		return;
	}

	return {
		publishedAt: state.publishedAt,
		score: state.score,
		snippet: summarizeSnippet(state.snippetLines.join("\n"), state.title),
		source: state.source,
		title: state.title || state.url,
		url: state.url,
	};
};

const applySearchSectionLine = (
	state: SearchSectionState,
	line: string,
): void => {
	if (state.inText) {
		state.snippetLines.push(line);
		return;
	}
	if (applyTitleLine(state, line)) {
		return;
	}
	if (applyUrlLine(state, line)) {
		return;
	}
	if (applyMetadataLine(state, line)) {
		return;
	}
	applySnippetStartLine(state, line);
};

const applyTitleLine = (state: SearchSectionState, line: string): boolean => {
	if (line.startsWith("Title: ")) {
		state.title = line.slice("Title: ".length).trim();
		return true;
	}
	return false;
};

const applyUrlLine = (state: SearchSectionState, line: string): boolean => {
	if (line.startsWith("URL: ")) {
		state.url = line.slice("URL: ".length).trim();
		return true;
	}
	return false;
};

const applyMetadataLine = (state: SearchSectionState, line: string): boolean => {
	if (line.startsWith("Published Date: ")) {
		state.publishedAt = normalizeMetadataValue(
			line.slice("Published Date: ".length),
		);
		return true;
	}
	if (line.startsWith("Published: ")) {
		state.publishedAt = normalizeMetadataValue(line.slice("Published: ".length));
		return true;
	}
	if (line.startsWith("Source: ")) {
		state.source = normalizeMetadataValue(line.slice("Source: ".length));
		return true;
	}
	if (line.startsWith("Author: ") && state.source === undefined) {
		state.source = normalizeMetadataValue(line.slice("Author: ".length));
		return true;
	}
	if (line.startsWith("Score: ")) {
		state.score = parseScore(line.slice("Score: ".length));
		return true;
	}
	return false;
};

const applySnippetStartLine = (
	state: SearchSectionState,
	line: string,
): boolean => {
	if (line.startsWith("Text:")) {
		state.inText = true;
		state.snippetLines.push(line.slice("Text:".length).trim());
		return true;
	}
	if (line.startsWith("Highlights:")) {
		state.inText = true;
		state.snippetLines.push(line.slice("Highlights:".length).trim());
		return true;
	}
	return false;
};

const parseScore = (value: string): number | undefined => {
	const parsedScore = Number.parseFloat(value.trim());
	if (Number.isFinite(parsedScore)) {
		return parsedScore;
	}
};

const summarizeSnippet = (text: string, title: string): string | undefined => {
	const collapsed = text
		.replaceAll("\r\n", "\n")
		.replaceAll(/^\s*---+\s*$/gmu, "")
		.replaceAll(/^#+\s+/gmu, "")
		.replaceAll(/\n{3,}/gu, "\n\n")
		.replaceAll(/[ \t]+/gu, " ")
		.trim();
	if (collapsed.length === 0) {
		return;
	}

	let snippet = collapsed;
	if (title) {
		snippet = stripRepeatedLeadingTitle(snippet, title);
	}
	if (snippet.length === 0) {
		snippet = collapsed;
	}
	if (snippet.length <= 280) {
		return snippet;
	}
	return `${snippet.slice(0, 277).trimEnd()}...`;
};

const stripRepeatedLeadingTitle = (snippet: string, title: string): string => {
	const normalizedTitle = title.trim().toLowerCase();
	let current = snippet.trim();
	while (current) {
		const lines = current.split("\n");
		const firstIndex = lines.findIndex((line) => line.trim().length > 0);
		if (firstIndex === -1) {
			return current.trim();
		}
		if (lines[firstIndex]?.trim().toLowerCase() !== normalizedTitle) {
			return current.trim();
		}
		current = lines.slice(firstIndex + 1).join("\n").trim();
	}
	return current.trim();
};

const normalizeMetadataValue = (value: string): string | undefined => {
	const normalized = value.trim();
	if (normalized.length === 0) {
		return;
	}

	const lowered = normalized.toLowerCase();
	if (EMPTY_METADATA_VALUES.has(lowered)) {
		return;
	}

	return normalized;
};

const isExplicitNoResultsText = (text: string): boolean => {
	const normalized = text.trim().toLowerCase();
	if (normalized.length === 0) {
		return true;
	}
	return (
		normalized === "no results found" ||
		normalized.startsWith("no results found") ||
		normalized.includes("no relevant results")
	);
};
