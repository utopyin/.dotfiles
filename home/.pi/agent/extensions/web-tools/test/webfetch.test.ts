import assert from "node:assert/strict";

import { describe, test } from "vitest";

import {
  createWebFetchHeaders,
  getFallbackUserAgent,
  OPENCODE_WEBFETCH_DEFAULT_USER_AGENT,
  OPENCODE_WEBFETCH_FALLBACK_USER_AGENT,
  shouldRetryWithFallbackUserAgent,
} from "../webfetch.ts";

describe("webfetch helpers", () => {
  test("createWebFetchHeaders uses the OpenCode browser-like default user agent", () => {
    const headers = createWebFetchHeaders("text/html");
    assert.equal(headers["User-Agent"], OPENCODE_WEBFETCH_DEFAULT_USER_AGENT);
    assert.equal(headers.Accept, "text/html");
    assert.equal(headers["Accept-Language"], "en-US,en;q=0.9");
  });

  test("getFallbackUserAgent prefers configured setting and otherwise falls back", () => {
    assert.equal(getFallbackUserAgent("my-agent/1.0"), "my-agent/1.0");
    assert.equal(getFallbackUserAgent("  custom-agent  "), "custom-agent");
    assert.equal(
      getFallbackUserAgent(""),
      OPENCODE_WEBFETCH_FALLBACK_USER_AGENT
    );
    assert.equal(
      getFallbackUserAgent("   "),
      OPENCODE_WEBFETCH_FALLBACK_USER_AGENT
    );
    assert.equal(getFallbackUserAgent(), OPENCODE_WEBFETCH_FALLBACK_USER_AGENT);
  });

  test("shouldRetryWithFallbackUserAgent only retries Cloudflare challenge case", () => {
    assert.equal(
      shouldRetryWithFallbackUserAgent({
        headers: new Headers({ "cf-mitigated": "challenge" }),
        status: 403,
      }),
      true
    );
    assert.equal(
      shouldRetryWithFallbackUserAgent({
        headers: new Headers(),
        status: 403,
      }),
      false
    );
    assert.equal(
      shouldRetryWithFallbackUserAgent({
        headers: new Headers({ "cf-mitigated": "challenge" }),
        status: 429,
      }),
      false
    );
  });
});
