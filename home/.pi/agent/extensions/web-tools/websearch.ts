import { StringEnum } from "@earendil-works/pi-ai";
import type { TextContent } from "@earendil-works/pi-ai";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";

import { createOperationSignal, isAbortError } from "./network.ts";
import { ExaSearchProvider } from "./providers/exa.ts";
import type { SearchProvider } from "./providers/types.ts";
import {
  appendExpandedPreview,
  appendExpandHint,
  getTextContent,
} from "./render.ts";
import { getWebToolsSettings } from "./settings.ts";
import { truncateTextOutput } from "./truncation.ts";
import type {
  NormalizedSearchResult,
  SearchDepth,
  WebSearchDetails,
} from "./types.ts";

const SEARCH_DEPTHS = ["auto", "fast", "deep"] as const;

type RenderTheme = Pick<Theme, "bold" | "fg">;

interface ToolRenderOptions {
  expanded: boolean;
  isPartial: boolean;
}

interface WebSearchResult {
  content: { text?: string; type: string }[];
  details?: WebSearchDetails;
  isError?: boolean;
}

type WebSearchUpdate = (update: {
  content: TextContent[];
  details: WebSearchDetails;
}) => void;

export const createWebSearchTool = () => ({
  description:
    "Search the public web for current information and candidate URLs to inspect with webfetch.",
  execute: (
    _toolCallId: string,
    params: { depth?: SearchDepth; maxResults?: number; query: string },
    signal?: AbortSignal,
    onUpdate?: WebSearchUpdate
  ) => executeWebSearch(params, signal, onUpdate),
  label: "Web Search",
  name: "websearch",
  parameters: Type.Object({
    depth: Type.Optional(
      StringEnum([...SEARCH_DEPTHS], {
        description:
          "Search depth. Overrides the web-tools search default depth setting. 'deep' is accepted as a compatibility alias and mapped to 'fast' for the current Exa provider.",
      })
    ),
    maxResults: Type.Optional(
      Type.Number({
        description:
          "Maximum number of results to return. Overrides the web-tools search default max results setting.",
      })
    ),
    query: Type.String({ description: "Search query." }),
  }),
  promptGuidelines: [
    "Use this tool when the user needs current public-web information or when the right URL is not yet known.",
    "After picking a promising result, use webfetch on that URL for deeper inspection.",
  ],
  promptSnippet:
    "Search the public web for current information and relevant URLs",
  renderCall(
    args: { depth?: SearchDepth; maxResults?: number; query: string },
    theme: RenderTheme
  ) {
    const { depth, maxResults, query } = args;
    let text = theme.fg("toolTitle", theme.bold("websearch "));
    text += theme.fg("accent", JSON.stringify(String(query)));
    if (depth && depth !== "auto") {
      text += theme.fg("muted", ` (${depth})`);
    }
    if (maxResults) {
      text += theme.fg("dim", ` limit=${maxResults}`);
    }
    return new Text(text, 0, 0);
  },
  renderResult(
    result: WebSearchResult,
    options: ToolRenderOptions,
    theme: RenderTheme
  ) {
    if (options.isPartial) {
      return new Text(theme.fg("warning", "Searching..."), 0, 0);
    }
    if (result.isError) {
      return new Text(
        theme.fg(
          "error",
          `✗ ${getTextContent(result.content) || "Search failed"}`
        ),
        0,
        0
      );
    }

    const { details } = result;
    let text = theme.fg("success", `✓ ${details?.resultCount ?? 0} results`);
    if (details?.provider) {
      text += theme.fg("muted", ` (${details.provider})`);
    }
    if (details?.truncated) {
      text += theme.fg("warning", " [truncated]");
    }
    text = appendExpandHint(text, options.expanded);

    if (options.expanded) {
      text = appendExpandedPreview(
        text,
        getTextContent(result.content),
        theme,
        {
          maxColumns: 220,
          maxLines: 16,
        }
      );
      if (details?.fullOutputPath) {
        text += `\n${theme.fg("dim", `Full output: ${details.fullOutputPath}`)}`;
      }
    }

    return new Text(text, 0, 0);
  },
});

export const formatSearchResults = (
  query: string,
  results: NormalizedSearchResult[]
): string => {
  if (results.length === 0) {
    return `Search results for: ${query}\n\nNo results found.`;
  }

  const lines = [`Search results for: ${query}`, ""];
  for (const [index, result] of results.entries()) {
    lines.push(`${index + 1}. ${result.title}`);
    lines.push(`   URL: ${result.url}`);
    if (result.publishedAt) {
      lines.push(`   Published: ${result.publishedAt}`);
    }
    if (result.source) {
      lines.push(`   Source: ${result.source}`);
    }
    if (typeof result.score === "number") {
      lines.push(`   Score: ${result.score}`);
    }
    if (result.snippet) {
      lines.push(`   Snippet: ${result.snippet}`);
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd();
};

const executeWebSearch = async (
  params: { depth?: SearchDepth; maxResults?: number; query: string },
  signal?: AbortSignal,
  onUpdate?: WebSearchUpdate
) => {
  const settings = getWebToolsSettings();
  if (settings.search.enabled === false) {
    throw new Error(
      "websearch is disabled in web-tools settings. Enable it to use this tool."
    );
  }

  const query = params.query.trim();
  if (query.length === 0) {
    throw new Error("Search query cannot be empty");
  }

  const depth = params.depth ?? settings.search.defaultDepth;
  const maxResults = clampMaxResults(
    params.maxResults ?? settings.search.defaultMaxResults
  );
  const timeoutSeconds = clampTimeoutSeconds(settings.search.timeoutSeconds);
  const composed = createOperationSignal(timeoutSeconds * 1000, signal);

  onUpdate?.({
    content: [textContent(`Searching for ${JSON.stringify(query)}...`)],
    details: {
      depth,
      maxResults,
      provider: settings.search.provider,
      query,
      resultCount: 0,
      results: [],
    },
  });

  try {
    const provider = createProvider();
    const results = await provider.search(
      { depth, maxResults, query },
      composed.signal
    );
    const output = formatSearchResults(query, results);
    const truncated = await truncateTextOutput(output, {
      fileName: "output.txt",
      tempPrefix: "pi-websearch-",
    });
    const details = createSearchDetails({
      depth,
      maxResults,
      provider,
      query,
      results,
      truncated,
    });

    return {
      content: [textContent(truncated.text)],
      details,
    };
  } catch (error) {
    if (signal?.aborted) {
      throw new Error("Web search cancelled", { cause: error });
    }
    if (isAbortError(error) || composed.signal.aborted) {
      throw new Error(`Web search timed out after ${timeoutSeconds}s`, {
        cause: error,
      });
    }
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(String(error), { cause: error });
  } finally {
    composed.cleanup();
  }
};

const createSearchDetails = (input: {
  depth: SearchDepth;
  maxResults: number;
  provider: SearchProvider;
  query: string;
  results: NormalizedSearchResult[];
  truncated: { fullOutputPath?: string; truncated: boolean };
}): WebSearchDetails => ({
  depth: input.depth,
  fullOutputPath: input.truncated.fullOutputPath,
  maxResults: input.maxResults,
  provider: input.provider.name,
  query: input.query,
  resultCount: input.results.length,
  results: input.results,
  truncated: input.truncated.truncated,
});

const createProvider = (): SearchProvider => {
  const settings = getWebToolsSettings();
  switch (settings.search.provider) {
    case "exa": {
      return new ExaSearchProvider(settings.search.endpoint);
    }
    default: {
      throw new Error(
        `Unsupported search provider: ${settings.search.provider}`
      );
    }
  }
};

const clampMaxResults = (value: number): number => {
  if (Number.isFinite(value)) {
    return Math.max(1, Math.min(20, Math.round(value)));
  }
  return 8;
};

const clampTimeoutSeconds = (timeout: number): number => {
  if (Number.isFinite(timeout)) {
    return Math.max(1, Math.min(120, Math.round(timeout)));
  }
  return 25;
};

const textContent = (text: string): TextContent => ({ text, type: "text" });
