import * as Effect from "effect/Effect";
import { describe, expect, it } from "vitest";

import {
  GitHubIdentityError,
  parseGitHubIdentity,
  renderGitIdentityConfig,
} from "./GitSetup.ts";

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
