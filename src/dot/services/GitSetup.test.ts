import { readFile } from "node:fs/promises";

import * as Effect from "effect/Effect";
import { describe, expect, it } from "vitest";

import {
  GitHubIdentityError,
  parseGitHubIdentity,
  renderGitIdentityConfig,
} from "./GitSetup.ts";

const trackedGitConfig = new URL(
  "../../../home/common/.config/git/config",
  import.meta.url
);

describe("tracked Git configuration", () => {
  it("uses GitHub CLI credentials and automatically tracks new branches", async () => {
    const config = await readFile(trackedGitConfig, "utf-8");

    expect(config).toContain('[credential "https://github.com"]');
    expect(config).toContain("helper = !gh auth git-credential");
    expect(config).toContain("autoSetupRemote = true");
  });
});

describe(parseGitHubIdentity, () => {
  it("uses the GitHub noreply address when the public email is null", async () => {
    const identity = await Effect.runPromise(
      parseGitHubIdentity(
        JSON.stringify({
          email: null,
          id: 30_875_147,
          login: "utopyin",
          name: "utopy",
        })
      )
    );

    expect(identity).toStrictEqual({
      email: "30875147+utopyin@users.noreply.github.com",
      name: "utopy",
    });
    expect(renderGitIdentityConfig(identity)).toBe(`[user]
\tname = "utopy"
\temail = "30875147+utopyin@users.noreply.github.com"
`);
  });

  it("rejects responses without a GitHub login", async () => {
    const error = await Effect.runPromise(
      Effect.flip(parseGitHubIdentity(JSON.stringify({ id: 30_875_147 })))
    );

    expect(error).toBeInstanceOf(GitHubIdentityError);
  });
});
