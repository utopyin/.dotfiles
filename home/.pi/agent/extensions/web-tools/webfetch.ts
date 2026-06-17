import { StringEnum } from "@earendil-works/pi-ai";
import type { ImageContent, TextContent } from "@earendil-works/pi-ai";
import { formatSize } from "@earendil-works/pi-coding-agent";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";

import {
  htmlToMarkdown,
  htmlToText,
  isPoorMarkdownConversion,
} from "./html.ts";
import {
  createOperationSignal,
  decodeTextBuffer,
  fetchWithRedirects,
  isAbortError,
  normalizeAndValidateUrl,
  parseContentType,
  readBodyWithLimit,
} from "./network.ts";
import {
  appendExpandedPreview,
  appendExpandHint,
  getTextContent,
} from "./render.ts";
import { getWebToolsSettings } from "./settings.ts";
import { truncateTextOutput } from "./truncation.ts";
import type { WebFetchDetails, WebFetchFormat } from "./types.ts";

const WEBFETCH_FORMATS = ["text", "markdown", "html"] as const;
export const OPENCODE_WEBFETCH_DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36";
export const OPENCODE_WEBFETCH_FALLBACK_USER_AGENT = "opencode";

interface FetchResponseResult {
  finalUrl: URL;
  response: Response;
}

type RenderTheme = Pick<Theme, "bold" | "fg">;

interface ToolRenderOptions {
  expanded: boolean;
  isPartial: boolean;
}

interface WebFetchResult {
  content: { text?: string; type: string }[];
  details?: WebFetchDetails;
  isError?: boolean;
}

type WebFetchUpdate = (update: {
  content: TextContent[];
  details: WebFetchDetails;
}) => void;

export const createWebFetchTool = () => ({
  description:
    "Fetch a single URL and return readable markdown, text, raw HTML/source, or an inline raster image.",
  execute: (
    _toolCallId: string,
    params: { format?: WebFetchFormat; timeout?: number; url: string },
    signal?: AbortSignal,
    onUpdate?: WebFetchUpdate
  ) => executeWebFetch(params, signal, onUpdate),
  label: "Web Fetch",
  name: "webfetch",
  parameters: Type.Object({
    format: Type.Optional(
      StringEnum([...WEBFETCH_FORMATS], {
        description:
          "Return format. Defaults to the web-tools fetch default format setting.",
      })
    ),
    timeout: Type.Optional(
      Type.Number({
        description:
          "Optional timeout in seconds. Overrides the web-tools fetch timeout setting.",
      })
    ),
    url: Type.String({ description: "The http:// or https:// URL to fetch." }),
  }),
  promptGuidelines: [
    "Use this tool when the user provides a URL or after websearch identifies a page to inspect.",
    "Prefer format=markdown unless the user explicitly wants plain text or raw source.",
  ],
  promptSnippet:
    "Fetch one public URL as markdown, text, html, or an inline raster image",
  renderCall(
    args: { format?: WebFetchFormat; url: string },
    theme: RenderTheme
  ) {
    const { format, url } = args;
    let text = theme.fg("toolTitle", theme.bold("webfetch "));
    text += theme.fg("accent", String(url));
    if (format && format !== "markdown") {
      text += theme.fg("muted", ` (${format})`);
    }
    return new Text(text, 0, 0);
  },
  renderResult(
    result: WebFetchResult,
    options: ToolRenderOptions,
    theme: RenderTheme
  ) {
    if (options.isPartial) {
      return new Text(theme.fg("warning", "Fetching..."), 0, 0);
    }
    if (result.isError) {
      return new Text(
        theme.fg(
          "error",
          `✗ ${getTextContent(result.content) || "Fetch failed"}`
        ),
        0,
        0
      );
    }

    const { details } = result;
    let text = theme.fg("success", "✓ Fetched");
    if (details?.mime) {
      text += theme.fg("muted", ` (${details.mime})`);
    }
    if (details?.bytes) {
      text += theme.fg("dim", ` ${formatSize(details.bytes)}`);
    }
    if (details?.truncated) {
      text += theme.fg("warning", " [truncated]");
    }
    if (details?.image) {
      text += theme.fg("muted", " [image]");
    }
    text = appendExpandHint(text, options.expanded);
    text = appendExpandedFetchDetails(text, result, options, theme);
    return new Text(text, 0, 0);
  },
});

export const createWebFetchHeaders = (
  accept: string,
  userAgent = OPENCODE_WEBFETCH_DEFAULT_USER_AGENT
): Record<string, string> => ({
  Accept: accept,
  "Accept-Language": "en-US,en;q=0.9",
  "User-Agent": userAgent,
});

export const getFallbackUserAgent = (configuredUserAgent?: string): string => {
  const trimmed = configuredUserAgent?.trim();
  return trimmed || OPENCODE_WEBFETCH_FALLBACK_USER_AGENT;
};

export const shouldRetryWithFallbackUserAgent = (
  response: Pick<Response, "headers" | "status">
): boolean =>
  response.status === 403 &&
  response.headers.get("cf-mitigated") === "challenge";

const executeWebFetch = async (
  params: { format?: WebFetchFormat; timeout?: number; url: string },
  signal?: AbortSignal,
  onUpdate?: WebFetchUpdate
) => {
  const settings = getWebToolsSettings();
  const requestedUrl = normalizeAndValidateUrl(params.url);
  const format = params.format ?? settings.fetch.defaultFormat;
  const timeoutSeconds = clampTimeoutSeconds(
    params.timeout ?? settings.fetch.timeoutSeconds
  );
  const composed = createOperationSignal(timeoutSeconds * 1000, signal);

  onUpdate?.({
    content: [textContent(`Fetching ${requestedUrl.toString()}...`)],
    details: createInitialDetails(requestedUrl, format),
  });

  try {
    const fetchResult = await fetchResponseWithRetry({
      format,
      requestedUrl,
      signal: composed.signal,
    });
    return await processWebFetchResponse({
      fetchResult,
      format,
      requestedUrl,
      signal: composed.signal,
    });
  } catch (error) {
    if (signal?.aborted) {
      throw new Error("Web fetch cancelled", { cause: error });
    }
    if (isAbortError(error) || composed.signal.aborted) {
      throw new Error(`Web fetch timed out after ${timeoutSeconds}s`, {
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

const fetchResponseWithRetry = async (input: {
  format: WebFetchFormat;
  requestedUrl: URL;
  signal: AbortSignal;
}): Promise<FetchResponseResult> => {
  const settings = getWebToolsSettings();
  const accept = getAcceptHeader(input.format);
  const baseHeaders = createWebFetchHeaders(accept);
  let result = await fetchWithRedirects(input.requestedUrl, {
    blockPrivateHosts: settings.fetch.blockPrivateHosts,
    headers: baseHeaders,
    maxRedirects: settings.fetch.maxRedirects,
    signal: input.signal,
  });

  if (shouldRetryWithFallbackUserAgent(result.response)) {
    await result.response.body?.cancel().catch(ignoreCancelError);
    const retryHeaders = createWebFetchHeaders(
      accept,
      getFallbackUserAgent(settings.fetch.fallbackUserAgent)
    );
    result = await fetchWithRedirects(input.requestedUrl, {
      blockPrivateHosts: settings.fetch.blockPrivateHosts,
      headers: retryHeaders,
      maxRedirects: settings.fetch.maxRedirects,
      signal: input.signal,
    });
  }

  assertSuccessfulResponse(result.response);
  assertDeclaredResponseSize(result.response);
  return result;
};

const processWebFetchResponse = async (input: {
  fetchResult: FetchResponseResult;
  format: WebFetchFormat;
  requestedUrl: URL;
  signal: AbortSignal;
}) => {
  const settings = getWebToolsSettings();
  const parsedContentType = parseContentType(
    input.fetchResult.response.headers.get("content-type")
  );
  const { buffer, bytes } = await readBodyWithLimit(
    input.fetchResult.response,
    settings.fetch.maxResponseBytes,
    input.signal
  );

  if (parsedContentType.kind === "raster-image") {
    return createImageFetchResult({
      buffer,
      bytes,
      finalUrl: input.fetchResult.finalUrl,
      format: input.format,
      parsedContentType,
      requestedUrl: input.requestedUrl,
      status: input.fetchResult.response.status,
    });
  }

  if (parsedContentType.kind === "binary") {
    throw new Error(
      `Unsupported binary content${parsedContentType.mime ? ` (${parsedContentType.mime})` : ""}. Try a more text-oriented URL.`
    );
  }

  return createTextFetchResult({
    buffer,
    bytes,
    finalUrl: input.fetchResult.finalUrl,
    format: input.format,
    parsedContentType,
    requestedUrl: input.requestedUrl,
    status: input.fetchResult.response.status,
  });
};

const createImageFetchResult = (input: {
  buffer: Buffer;
  bytes: number;
  finalUrl: URL;
  format: WebFetchFormat;
  parsedContentType: { contentType: string; mime: string };
  requestedUrl: URL;
  status: number;
}) => {
  const details: WebFetchDetails = {
    bytes: input.bytes,
    contentType: input.parsedContentType.contentType,
    finalUrl: input.finalUrl.toString(),
    format: input.format,
    image: true,
    mime: input.parsedContentType.mime,
    requestedUrl: input.requestedUrl.toString(),
    status: input.status,
  };
  return {
    content: [
      textContent(
        `Fetched image from ${input.finalUrl.toString()} (${input.parsedContentType.mime || "image"}, ${formatSize(input.bytes)})`
      ),
      imageContent(
        input.buffer.toString("base64"),
        input.parsedContentType.mime
      ),
    ],
    details,
  };
};

const createTextFetchResult = async (input: {
  buffer: Buffer;
  bytes: number;
  finalUrl: URL;
  format: WebFetchFormat;
  parsedContentType: {
    charset?: string;
    contentType: string;
    kind: string;
    mime: string;
  };
  requestedUrl: URL;
  status: number;
}) => {
  const { decoder, text: decodedText } = decodeTextBuffer(
    input.buffer,
    input.parsedContentType.charset
  );
  const outputText = convertOutputText(
    decodedText,
    input.finalUrl,
    input.format,
    input.parsedContentType.kind
  );
  const truncated = await truncateTextOutput(outputText, {
    fileName: "output.txt",
    tempPrefix: "pi-webfetch-",
  });
  const details: WebFetchDetails = {
    bytes: input.bytes,
    charset: input.parsedContentType.charset,
    contentType: input.parsedContentType.contentType,
    decoder,
    finalUrl: input.finalUrl.toString(),
    format: input.format,
    fullOutputPath: truncated.fullOutputPath,
    mime: input.parsedContentType.mime,
    requestedUrl: input.requestedUrl.toString(),
    status: input.status,
    truncated: truncated.truncated,
  };

  return {
    content: [textContent(truncated.text)],
    details,
  };
};

const createInitialDetails = (
  requestedUrl: URL,
  format: WebFetchFormat
): WebFetchDetails => ({
  bytes: 0,
  contentType: "",
  finalUrl: requestedUrl.toString(),
  format,
  mime: "",
  requestedUrl: requestedUrl.toString(),
  status: 0,
});

const assertSuccessfulResponse = (response: Response): void => {
  if (response.ok) {
    return;
  }
  throw new Error(
    `Request failed (${response.status} ${response.statusText || ""})`.trim()
  );
};

const assertDeclaredResponseSize = (response: Response): void => {
  const settings = getWebToolsSettings();
  const contentLength = response.headers.get("content-length");
  if (contentLength) {
    const declaredBytes = Number.parseInt(contentLength, 10);
    if (
      Number.isFinite(declaredBytes) &&
      declaredBytes > settings.fetch.maxResponseBytes
    ) {
      throw new Error(
        `Response too large (exceeds ${Math.floor(settings.fetch.maxResponseBytes / (1024 * 1024))}MB limit)`
      );
    }
  }
};

const convertOutputText = (
  decodedText: string,
  finalUrl: URL,
  format: WebFetchFormat,
  kind: string
): string => {
  if (kind === "html" && format === "markdown") {
    return convertHtmlToMarkdown(decodedText, finalUrl.toString());
  }
  if (kind === "html" && format === "text") {
    return htmlToText(decodedText, finalUrl.toString());
  }
  return decodedText;
};

const convertHtmlToMarkdown = (
  decodedText: string,
  finalUrl: string
): string => {
  const markdown = htmlToMarkdown(decodedText, finalUrl);
  return isPoorMarkdownConversion(markdown)
    ? htmlToText(decodedText, finalUrl)
    : markdown;
};

const appendExpandedFetchDetails = (
  base: string,
  result: WebFetchResult,
  options: ToolRenderOptions,
  theme: RenderTheme
): string => {
  if (options.expanded === false) {
    return base;
  }

  const { details } = result;
  let text = base;
  if (details?.image) {
    text += `\n${theme.fg("dim", `Image URL: ${details.finalUrl}`)}`;
  } else {
    text = appendExpandedPreview(text, getTextContent(result.content), theme, {
      maxColumns: 220,
      maxLines: 12,
    });
  }
  if (details?.fullOutputPath) {
    text += `\n${theme.fg("dim", `Full output: ${details.fullOutputPath}`)}`;
  }
  return text;
};

const ignoreCancelError = (error: unknown): void => {
  void error;
};

const getAcceptHeader = (format: WebFetchFormat): string => {
  switch (format) {
    case "html": {
      return "text/html;q=1.0, application/xhtml+xml;q=0.9, text/plain;q=0.8, text/markdown;q=0.7, */*;q=0.1";
    }
    case "markdown": {
      return "text/markdown;q=1.0, text/x-markdown;q=0.9, text/plain;q=0.8, text/html;q=0.7, application/xhtml+xml;q=0.6, */*;q=0.1";
    }
    case "text": {
      return "text/plain;q=1.0, text/markdown;q=0.9, text/html;q=0.8, application/xhtml+xml;q=0.7, */*;q=0.1";
    }
    default: {
      throw new Error(`Unsupported fetch format: ${format}`);
    }
  }
};

const clampTimeoutSeconds = (timeout: number): number => {
  if (Number.isFinite(timeout)) {
    return Math.max(1, Math.min(120, Math.round(timeout)));
  }
  return 30;
};

const textContent = (text: string): TextContent => ({ text, type: "text" });

const imageContent = (data: string, mimeType: string): ImageContent => ({
  data,
  mimeType,
  type: "image",
});
