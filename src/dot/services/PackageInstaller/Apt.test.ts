import { describe, expect, it } from "vitest";

import { parseInstalledPackages, resolveAptGetCommand } from "./Apt.ts";

describe(resolveAptGetCommand, () => {
  it("runs apt-get directly as root", () => {
    expect(
      resolveAptGetCommand({ hasTerminal: false, isRoot: true })
    ).toStrictEqual({
      args: [],
      command: "apt-get",
      requiresPolicyKit: false,
    });
  });

  it("uses sudo in a terminal", () => {
    expect(
      resolveAptGetCommand({ hasTerminal: true, isRoot: false })
    ).toStrictEqual({
      args: ["apt-get"],
      command: "sudo",
      requiresPolicyKit: false,
    });
  });

  it("uses PolicyKit without a terminal", () => {
    expect(
      resolveAptGetCommand({ hasTerminal: false, isRoot: false })
    ).toStrictEqual({
      args: ["apt-get"],
      command: "pkexec",
      requiresPolicyKit: true,
    });
  });
});

describe(parseInstalledPackages, () => {
  it("keeps only fully installed packages", () => {
    expect(
      parseInstalledPackages("git installed\nvim config-files\nzsh installed\n")
    ).toStrictEqual(new Set(["git", "zsh"]));
  });
});
