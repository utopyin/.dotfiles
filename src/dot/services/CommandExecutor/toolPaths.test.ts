import { describe, expect, it } from "vitest";

import { withToolPaths } from "./toolPaths.ts";

describe(withToolPaths, () => {
  it("appends the local bin and Mise shims directories", () => {
    expect(withToolPaths({ HOME: "/home/dev", PATH: "/usr/bin" })).toBe(
      "/usr/bin:/home/dev/.local/bin:/home/dev/.local/share/mise/shims"
    );
  });

  it("does not duplicate entries and honors MISE_DATA_DIR", () => {
    expect(
      withToolPaths({
        HOME: "/home/dev",
        MISE_DATA_DIR: "/opt/mise",
        PATH: "/home/dev/.local/bin:/usr/bin",
      })
    ).toBe("/home/dev/.local/bin:/usr/bin:/opt/mise/shims");
  });
});
