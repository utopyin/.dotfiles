import { describe, expect, it } from "vitest";

import { resolveInstallCommand, resolveRemoveCommand } from "./Omarchy.ts";

describe(resolveInstallCommand, () => {
  it("uses Omarchy directly for repository packages in a terminal", () => {
    expect(resolveInstallCommand("repo", true)).toStrictEqual({
      args: ["pkg", "add"],
      command: "omarchy",
      requiresPolicyKit: false,
    });
  });

  it("uses PolicyKit for system packages without a terminal", () => {
    expect(resolveInstallCommand("repo", false)).toStrictEqual({
      args: ["omarchy", "pkg", "add"],
      command: "pkexec",
      requiresPolicyKit: true,
    });
  });

  it("uses Omarchy for AUR packages in a terminal", () => {
    expect(resolveInstallCommand("aur", true)).toStrictEqual({
      args: ["pkg", "aur", "add"],
      command: "omarchy",
      requiresPolicyKit: false,
    });
  });

  it("builds AUR packages as the user and delegates Pacman to PolicyKit", () => {
    expect(resolveInstallCommand("aur", false)).toStrictEqual({
      args: [
        "--sudo",
        "pkexec",
        "--noconfirm",
        "--needed",
        "--answerclean",
        "None",
        "--answerdiff",
        "None",
        "-S",
      ],
      command: "yay",
      requiresPolicyKit: true,
    });
  });
});

describe(resolveRemoveCommand, () => {
  it("uses Omarchy directly in a terminal", () => {
    expect(resolveRemoveCommand(true)).toStrictEqual({
      args: ["pkg", "drop"],
      command: "omarchy",
      requiresPolicyKit: false,
    });
  });

  it("uses PolicyKit without a terminal", () => {
    expect(resolveRemoveCommand(false)).toStrictEqual({
      args: ["omarchy", "pkg", "drop"],
      command: "pkexec",
      requiresPolicyKit: true,
    });
  });
});
