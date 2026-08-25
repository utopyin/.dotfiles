import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { parseItemTitles } from "./OnePassword.ts";

describe(parseItemTitles, () => {
  it("extracts titles from an item-list response", async () => {
    const titles = await Effect.runPromise(
      parseItemTitles(
        '[{"id":"one","title":"Dotfiles Token"},{"id":"two","title":"Other"}]'
      )
    );

    expect(titles).toStrictEqual(new Set(["Dotfiles Token", "Other"]));
  });
});
