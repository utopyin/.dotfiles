import { describe, expect, it } from "vitest";

import { parseOsRelease } from "./PlatformInfo.ts";

describe(parseOsRelease, () => {
  it("decodes Omarchy's Arch identity", () => {
    expect(
      parseOsRelease('ID=omarchy\nID_LIKE=arch\nPRETTY_NAME="Omarchy"\n')
    ).toStrictEqual({
      ID: "omarchy",
      ID_LIKE: "arch",
      PRETTY_NAME: "Omarchy",
    });
  });

  it("ignores comments and malformed lines", () => {
    expect(parseOsRelease("# generated\nID=arch\nmalformed\n")).toStrictEqual({
      ID: "arch",
    });
  });
});
