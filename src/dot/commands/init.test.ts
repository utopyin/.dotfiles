import * as Option from "effect/Option";
import { describe, expect, it } from "vitest";

import { parseToolList, renderMiseLocalConfig } from "./init.ts";

describe(parseToolList, () => {
  it("splits and trims a comma-separated list", () => {
    expect(parseToolList(Option.some("herdr, codex,,"))).toStrictEqual([
      "herdr",
      "codex",
    ]);
  });

  it("is empty without the flag", () => {
    expect(parseToolList(Option.none())).toStrictEqual([]);
  });
});

describe(renderMiseLocalConfig, () => {
  it("renders a Mise disable_tools setting", () => {
    expect(renderMiseLocalConfig(["herdr", "codex"])).toContain(
      'disable_tools = ["herdr", "codex"]'
    );
  });
});
