import { describe, expect, it } from "vitest";

import { parseOsRelease, resolveEnvironment } from "./PlatformInfo.ts";

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

describe(resolveEnvironment, () => {
  it("maps macOS regardless of distribution values", () => {
    expect(resolveEnvironment("darwin", undefined, [])).toBe("macos");
  });

  it("maps Omarchy by its distribution id", () => {
    expect(resolveEnvironment("linux", "omarchy", ["arch"])).toBe("omarchy");
  });

  it("maps Ubuntu and its derivatives", () => {
    expect(resolveEnvironment("linux", "ubuntu", ["debian"])).toBe("ubuntu");
    expect(resolveEnvironment("linux", "pop", ["ubuntu", "debian"])).toBe(
      "ubuntu"
    );
  });

  it("leaves other distributions unsupported", () => {
    expect(resolveEnvironment("linux", "arch", [])).toBeUndefined();
  });
});
