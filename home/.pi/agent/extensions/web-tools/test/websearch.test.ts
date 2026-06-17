import assert from "node:assert/strict";

import { describe, test } from "vitest";

import {
  ExaSearchProvider,
  extractSearchErrorFromResponse,
  extractSearchTextFromResponse,
  normalizeExaDepth,
  parseExaSearchText,
  parseSseDataLines,
} from "../providers/exa.ts";
import { formatSearchResults } from "../websearch.ts";

interface SearchPayload {
  params?: {
    arguments?: {
      type?: string;
    };
  };
}

const LEGACY_PROVIDER_TEXT = [
  "Title: Example Domain",
  "URL: https://example.com/",
  "Text: Example Domain",
  "",
  "# Example Domain",
  "",
  "This domain is for use in documentation examples without needing permission.",
  "",
  "Title: Another Example",
  "Published Date: 2024-01-01T00:00:00.000Z",
  "URL: https://example.org/",
  "Text: Another Example",
  "",
  "Useful secondary snippet.",
].join("\n");

const CURRENT_PROVIDER_TEXT = [
  "Search Time: 1234.5ms",
  "",
  "Title: Cloudflare Testing - Hono",
  "URL: https://hono.dev/examples/cloudflare-vitest",
  "Published: N/A",
  "Author: N/A",
  "Highlights:",
  "Cloudflare Testing - Hono",
  "",
  "Use env from cloudflare:test with app.request().",
  "",
  "---",
  "",
  "Title: Test APIs · Cloudflare Workers docs",
  "URL: https://developers.cloudflare.com/workers/testing/vitest-integration/test-apis/",
  "Published: 2026-03-18T20:14:02.561Z",
  "Author: N/A",
  "Highlights:",
  "Test APIs · Cloudflare Workers docs",
  "",
  "fetchMock.disableNetConnect()",
].join("\n");

const SSE_RESPONSE = `event: message\ndata: ${JSON.stringify({
  id: 1,
  jsonrpc: "2.0",
  result: {
    content: [{ text: LEGACY_PROVIDER_TEXT, type: "text" }],
  },
})}\n\n`;

const SSE_ERROR_RESPONSE = `event: message\ndata: ${JSON.stringify({
  id: 1,
  jsonrpc: "2.0",
  result: {
    content: [{ text: "MCP error -32602: Invalid enum value", type: "text" }],
    isError: true,
  },
})}\n\n`;

describe("websearch helpers", () => {
  test("parseSseDataLines extracts JSON payloads from event streams", () => {
    const chunks = parseSseDataLines(SSE_RESPONSE);
    assert.equal(chunks.length, 1);
    assert.match(chunks[0] ?? "", /"jsonrpc":"2.0"/u);
  });

  test("extractSearchTextFromResponse extracts the provider text blob", () => {
    const text = extractSearchTextFromResponse(
      SSE_RESPONSE,
      "text/event-stream"
    );
    assert.match(text, /^Title: Example Domain/mu);
    assert.match(text, /^Title: Another Example/mu);
  });

  test("extractSearchErrorFromResponse extracts provider-side MCP errors", () => {
    assert.equal(
      extractSearchTextFromResponse(SSE_ERROR_RESPONSE, "text/event-stream"),
      ""
    );
    assert.equal(
      extractSearchErrorFromResponse(SSE_ERROR_RESPONSE, "text/event-stream"),
      "MCP error -32602: Invalid enum value"
    );
  });

  test("parseExaSearchText converts legacy provider text into normalized results", () => {
    const text = extractSearchTextFromResponse(
      SSE_RESPONSE,
      "text/event-stream"
    );
    const results = parseExaSearchText(text);
    assert.equal(results.length, 2);
    assert.deepEqual(results[0], {
      publishedAt: undefined,
      score: undefined,
      snippet:
        "This domain is for use in documentation examples without needing permission.",
      source: undefined,
      title: "Example Domain",
      url: "https://example.com/",
    });
    assert.equal(results[1]?.publishedAt, "2024-01-01T00:00:00.000Z");
  });

  test("parseExaSearchText supports current Exa search labels and strips boilerplate", () => {
    const results = parseExaSearchText(CURRENT_PROVIDER_TEXT);
    assert.equal(results.length, 2);
    assert.deepEqual(results[0], {
      publishedAt: undefined,
      score: undefined,
      snippet: "Use env from cloudflare:test with app.request().",
      source: undefined,
      title: "Cloudflare Testing - Hono",
      url: "https://hono.dev/examples/cloudflare-vitest",
    });
    assert.equal(results[1]?.publishedAt, "2026-03-18T20:14:02.561Z");
    assert.equal(results[1]?.source, undefined);
    assert.equal(results[1]?.snippet, "fetchMock.disableNetConnect()");
  });

  test("normalizeExaDepth keeps compatible depths and downgrades deep to fast", () => {
    assert.equal(normalizeExaDepth("auto"), "auto");
    assert.equal(normalizeExaDepth("fast"), "fast");
    assert.equal(normalizeExaDepth("deep"), "fast");
  });

  test("ExaSearchProvider sends fast when deep is requested", async () => {
    const originalFetch = globalThis.fetch;
    let requestBody = "";

    globalThis.fetch = (_input, init) => {
      requestBody = String(init?.body ?? "");
      return Promise.resolve(
        Response.json(
          {
            result: {
              content: [{ text: LEGACY_PROVIDER_TEXT, type: "text" }],
            },
          },
          {
            headers: { "content-type": "application/json" },
            status: 200,
          }
        )
      );
    };

    try {
      const provider = new ExaSearchProvider("https://example.test/mcp");
      const results = await provider.search({
        depth: "deep",
        maxResults: 5,
        query: "example",
      });
      assert.equal(results.length, 2);
      const payload = JSON.parse(requestBody) as SearchPayload;
      assert.equal(payload.params?.arguments?.type, "fast");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("ExaSearchProvider throws provider-side errors instead of empty results", async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = () =>
      Promise.resolve(
        new Response(SSE_ERROR_RESPONSE, {
          headers: { "content-type": "text/event-stream" },
          status: 200,
        })
      );

    try {
      const provider = new ExaSearchProvider("https://example.test/mcp");
      await assert.rejects(
        provider.search({ depth: "fast", maxResults: 5, query: "example" }),
        /MCP error -32602: Invalid enum value/u
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("formatSearchResults renders deterministic URL-forward output", () => {
    const output = formatSearchResults("example query", [
      {
        snippet: "Documentation-safe example domain.",
        title: "Example Domain",
        url: "https://example.com/",
      },
    ]);
    assert.equal(
      output,
      [
        "Search results for: example query",
        "",
        "1. Example Domain",
        "   URL: https://example.com/",
        "   Snippet: Documentation-safe example domain.",
      ].join("\n")
    );
  });
});
