import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { CommandExecutor } from "../CommandExecutor/index.ts";
import { PlatformInfo } from "../PlatformInfo.ts";
import { HyprlandConfigError } from "./errors.ts";
import type { ConfigLinkerShape } from "./index.ts";

export const makeStowConfigLinker = Effect.gen(function* () {
  const command = yield* CommandExecutor;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const platform = yield* PlatformInfo;
  const packageNames = ["common", platform.os === "darwin" ? "macos" : "linux"];

  return {
    linkHome: Effect.fn("StowConfigLinker.linkHome")(function* (
      dotfilesDir: string,
      homeDir: string
    ) {
      if (platform.os === "linux") {
        yield* verifyProspectiveHyprlandConfig(dotfilesDir, homeDir).pipe(
          Effect.provideService(CommandExecutor, command),
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.provideService(Path.Path, path)
        );
      }

      yield* backupConflicts(dotfilesDir, homeDir, packageNames).pipe(
        Effect.provideService(FileSystem.FileSystem, fs),
        Effect.provideService(Path.Path, path)
      );
      yield* command
        .run("stow", [
          "--dir",
          path.join(dotfilesDir, "home"),
          "--target",
          homeDir,
          "--no-folding",
          "--ignore",
          "\\.DS_Store$",
          "--ignore",
          NODE_MODULES_IGNORE,
          "--ignore",
          FOLDED_SKILLS_IGNORE,
          "--ignore",
          FOLDED_OMARCHY_THEMES_IGNORE,
          "--ignore",
          MANAGED_HYPRLAND_FILES_IGNORE,
          "--restow",
          ...packageNames,
        ])
        .pipe(Effect.asVoid);

      yield* ensureFoldedSkillLinks(dotfilesDir, homeDir).pipe(
        Effect.provideService(FileSystem.FileSystem, fs),
        Effect.provideService(Path.Path, path)
      );

      if (platform.os === "linux") {
        yield* ensureFoldedOmarchyThemesLink(dotfilesDir, homeDir).pipe(
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.provideService(Path.Path, path)
        );
        yield* ensureHyprlandConfigLinks(dotfilesDir, homeDir).pipe(
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.provideService(Path.Path, path)
        );
        yield* reloadAndValidateHyprland(homeDir).pipe(
          Effect.provideService(CommandExecutor, command),
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.provideService(Path.Path, path)
        );
      }
    }),
    unlinkHome: Effect.fn("StowConfigLinker.unlinkHome")(function* (
      dotfilesDir: string,
      homeDir: string
    ) {
      yield* removeFoldedSkillLinks(homeDir).pipe(
        Effect.provideService(FileSystem.FileSystem, fs),
        Effect.provideService(Path.Path, path)
      );

      if (platform.os === "linux") {
        yield* removeFoldedOmarchyThemesLink(homeDir).pipe(
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.provideService(Path.Path, path)
        );
      }

      yield* command
        .run("stow", [
          "--dir",
          path.join(dotfilesDir, "home"),
          "--target",
          homeDir,
          "--no-folding",
          "--ignore",
          "\\.DS_Store$",
          "--ignore",
          NODE_MODULES_IGNORE,
          "--ignore",
          FOLDED_SKILLS_IGNORE,
          "--ignore",
          FOLDED_OMARCHY_THEMES_IGNORE,
          "--delete",
          ...packageNames,
        ])
        .pipe(Effect.asVoid);
    }),
  } satisfies ConfigLinkerShape;
});

const verifyProspectiveHyprlandConfig = Effect.fn(
  "StowConfigLinker.verifyProspectiveHyprlandConfig"
)(function* (dotfilesDir: string, homeDir: string) {
  const command = yield* CommandExecutor;
  if (!(yield* command.exists("Hyprland"))) {
    return;
  }

  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const currentConfigDir = path.join(homeDir, ...HYPRLAND_CONFIG_SEGMENTS);
  const currentMainConfig = path.join(currentConfigDir, "hyprland.lua");
  if (!(yield* fs.exists(currentMainConfig))) {
    return;
  }

  yield* Effect.scoped(
    Effect.gen(function* () {
      const stagingHome = yield* fs.makeTempDirectoryScoped({
        prefix: "dot-hyprland-",
      });
      const stagingConfigDir = path.join(
        stagingHome,
        ...HYPRLAND_CONFIG_SEGMENTS
      );
      yield* fs.makeDirectory(stagingConfigDir, { recursive: true });

      const currentEntries = yield* fs.readDirectory(currentConfigDir);
      for (const entry of currentEntries) {
        if (entry.endsWith(".lua")) {
          yield* fs.copyFile(
            path.join(currentConfigDir, entry),
            path.join(stagingConfigDir, entry)
          );
        }
      }

      const sourceConfigDir = path.join(
        dotfilesDir,
        "home",
        "linux",
        ...HYPRLAND_CONFIG_SEGMENTS
      );
      for (const fileName of MANAGED_HYPRLAND_FILES) {
        yield* fs.copyFile(
          path.join(sourceConfigDir, fileName),
          path.join(stagingConfigDir, fileName)
        );
      }

      const currentStatePath = path.join(
        homeDir,
        ".local",
        "state",
        "omarchy",
        "current"
      );
      if (yield* fs.exists(currentStatePath)) {
        const stagingStateDir = path.join(
          stagingHome,
          ".local",
          "state",
          "omarchy"
        );
        yield* fs.makeDirectory(stagingStateDir, { recursive: true });
        yield* fs.symlink(
          currentStatePath,
          path.join(stagingStateDir, "current")
        );
      }

      yield* command
        .run("env", [
          `HOME=${stagingHome}`,
          `XDG_CONFIG_HOME=${path.join(stagingHome, ".config")}`,
          `XDG_STATE_HOME=${path.join(stagingHome, ".local", "state")}`,
          "Hyprland",
          "--verify-config",
          "--config",
          path.join(stagingConfigDir, "hyprland.lua"),
        ])
        .pipe(Effect.asVoid);
    })
  );
});

const ensureFoldedSkillLinks = Effect.fn(
  "StowConfigLinker.ensureFoldedSkillLinks"
)(function* (dotfilesDir: string, homeDir: string) {
  const path = yield* Path.Path;
  const sourcePath = path.join(
    dotfilesDir,
    "home",
    "common",
    ...SKILLS_SOURCE_SEGMENTS
  );

  for (const linkName of FOLDED_SKILL_LINKS) {
    const linkPath = path.join(homeDir, ...linkName.split("/"));
    yield* ensureDirectoryLink(sourcePath, linkPath, homeDir);
  }
});

const ensureFoldedOmarchyThemesLink = Effect.fn(
  "StowConfigLinker.ensureFoldedOmarchyThemesLink"
)(function* (dotfilesDir: string, homeDir: string) {
  const path = yield* Path.Path;
  const sourcePath = path.join(
    dotfilesDir,
    "home",
    "linux",
    ...OMARCHY_THEMES_SEGMENTS
  );
  const linkPath = path.join(homeDir, ...OMARCHY_THEMES_SEGMENTS);

  yield* ensureDirectoryLink(sourcePath, linkPath, homeDir);
});

const ensureHyprlandConfigLinks = Effect.fn(
  "StowConfigLinker.ensureHyprlandConfigLinks"
)(function* (dotfilesDir: string, homeDir: string) {
  const path = yield* Path.Path;
  const sourceConfigDir = path.join(
    dotfilesDir,
    "home",
    "linux",
    ...HYPRLAND_CONFIG_SEGMENTS
  );
  const targetConfigDir = path.join(homeDir, ...HYPRLAND_CONFIG_SEGMENTS);

  for (const fileName of MANAGED_HYPRLAND_FILES) {
    yield* ensureAtomicFileLink(
      path.join(sourceConfigDir, fileName),
      path.join(targetConfigDir, fileName),
      homeDir
    );
  }
});

const ensureAtomicFileLink = Effect.fn("StowConfigLinker.ensureAtomicFileLink")(
  function* (sourcePath: string, linkPath: string, homeDir: string) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const relativeTarget = path.relative(path.dirname(linkPath), sourcePath);

    if (yield* pathIsSymlink(linkPath)) {
      const currentTarget = yield* fs.readLink(linkPath);
      if (currentTarget === relativeTarget) {
        return;
      }
    } else if (yield* fs.exists(linkPath)) {
      yield* copyExistingFileToBackup(homeDir, linkPath);
    }

    yield* fs.makeDirectory(path.dirname(linkPath), { recursive: true });
    const temporaryLink = `${linkPath}.dot-${process.pid}-${Date.now()}`;
    yield* fs.symlink(relativeTarget, temporaryLink);
    yield* fs
      .rename(temporaryLink, linkPath)
      .pipe(
        Effect.ensuring(
          fs.remove(temporaryLink).pipe(Effect.catchCause(() => Effect.void))
        )
      );
  }
);

const reloadAndValidateHyprland = Effect.fn(
  "StowConfigLinker.reloadAndValidateHyprland"
)(function* (homeDir: string) {
  const command = yield* CommandExecutor;
  if (!(yield* command.exists("Hyprland"))) {
    return;
  }

  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const mainConfig = path.join(
    homeDir,
    ...HYPRLAND_CONFIG_SEGMENTS,
    "hyprland.lua"
  );
  if (!(yield* fs.exists(mainConfig))) {
    return;
  }

  yield* command
    .run("Hyprland", ["--verify-config", "--config", mainConfig])
    .pipe(Effect.asVoid);

  if (!(yield* command.exists("hyprctl"))) {
    return;
  }

  const instances = yield* command
    .runText("hyprctl", ["instances", "-j"])
    .pipe(Effect.catchCause(() => Effect.succeed("[]")));
  if (!hasRunningHyprlandInstance(instances)) {
    return;
  }

  yield* command.run("hyprctl", ["reload", "config-only"]);
  const errors = (yield* command.runText("hyprctl", ["configerrors"])).trim();
  if (errors.length > 0) {
    return yield* new HyprlandConfigError({ errors });
  }
});

const hasRunningHyprlandInstance = (instances: string): boolean => {
  try {
    const decoded: unknown = JSON.parse(instances);
    return Array.isArray(decoded) && decoded.length > 0;
  } catch {
    return false;
  }
};

const ensureDirectoryLink = Effect.fn("StowConfigLinker.ensureDirectoryLink")(
  function* (sourcePath: string, linkPath: string, homeDir: string) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    yield* fs.makeDirectory(path.dirname(linkPath), { recursive: true });

    const relativeTarget = path.relative(path.dirname(linkPath), sourcePath);

    const isLink = yield* pathIsSymlink(linkPath);
    if (isLink) {
      const currentTarget = yield* fs.readLink(linkPath);
      if (currentTarget === relativeTarget) {
        return;
      }
      yield* fs.remove(linkPath);
    } else {
      const exists = yield* fs.exists(linkPath);
      if (exists) {
        yield* backupExistingPath(homeDir, linkPath);
      }
    }

    yield* fs.symlink(relativeTarget, linkPath);
  }
);

const removeFoldedSkillLinks = Effect.fn(
  "StowConfigLinker.removeFoldedSkillLinks"
)(function* (homeDir: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  for (const linkName of FOLDED_SKILL_LINKS) {
    const linkPath = path.join(homeDir, ...linkName.split("/"));
    const isLink = yield* pathIsSymlink(linkPath);
    if (isLink) {
      yield* fs.remove(linkPath);
    }
  }
});

const removeFoldedOmarchyThemesLink = Effect.fn(
  "StowConfigLinker.removeFoldedOmarchyThemesLink"
)(function* (homeDir: string) {
  const path = yield* Path.Path;
  const linkPath = path.join(homeDir, ...OMARCHY_THEMES_SEGMENTS);
  const isLink = yield* pathIsSymlink(linkPath);
  if (isLink) {
    const fs = yield* FileSystem.FileSystem;
    yield* fs.remove(linkPath);
  }
});

const hasSymlinkAncestor = Effect.fn("StowConfigLinker.hasSymlinkAncestor")(
  function* (homeDir: string, entry: string) {
    const path = yield* Path.Path;
    const segments = entry
      .split(path.sep)
      .filter((segment) => segment.length > 0);
    for (let index = 1; index < segments.length; index += 1) {
      const candidate = path.join(homeDir, ...segments.slice(0, index));
      const isLink = yield* pathIsSymlink(candidate);
      if (isLink) {
        return true;
      }
    }
    return false;
  }
);

const pathIsSymlink = Effect.fn("StowConfigLinker.pathIsSymlink")(function* (
  filePath: string
) {
  const fs = yield* FileSystem.FileSystem;
  return yield* fs.readLink(filePath).pipe(
    Effect.as(true),
    Effect.catchCause(() => Effect.succeed(false))
  );
});

const backupExistingPath = Effect.fn("StowConfigLinker.backupExistingPath")(
  function* (homeDir: string, targetPath: string) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const stamp = new Date().toISOString().replaceAll(/[^0-9A-Za-z]+/gu, "-");
    const relativeEntry = path.relative(homeDir, targetPath);
    const backupPath = path.join(
      homeDir,
      ".dotfiles-backups",
      "stow",
      stamp,
      relativeEntry
    );

    yield* fs.makeDirectory(path.dirname(backupPath), { recursive: true });
    yield* fs.rename(targetPath, backupPath);
  }
);

const copyExistingFileToBackup = Effect.fn(
  "StowConfigLinker.copyExistingFileToBackup"
)(function* (homeDir: string, targetPath: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const stamp = new Date().toISOString().replaceAll(/[^0-9A-Za-z]+/gu, "-");
  const backupPath = path.join(
    homeDir,
    ".dotfiles-backups",
    "stow",
    stamp,
    path.relative(homeDir, targetPath)
  );

  yield* fs.makeDirectory(path.dirname(backupPath), { recursive: true });
  yield* fs.copyFile(targetPath, backupPath);
});

const backupConflicts = Effect.fn("StowConfigLinker.backupConflicts")(
  function* (
    dotfilesDir: string,
    homeDir: string,
    packageNames: readonly string[]
  ) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const stamp = new Date().toISOString().replaceAll(/[^0-9A-Za-z]+/gu, "-");
    const backupRoot = path.join(homeDir, ".dotfiles-backups", "stow", stamp);

    for (const packageName of packageNames) {
      const sourceRoot = path.join(dotfilesDir, "home", packageName);
      const entries = yield* fs.readDirectory(sourceRoot, { recursive: true });
      for (const entry of entries) {
        if (
          path.basename(entry) === ".DS_Store" ||
          isManagedHyprlandEntry(packageName, entry)
        ) {
          continue;
        }

        const sourcePath = path.join(sourceRoot, entry);
        const sourceInfo = yield* fs.stat(sourcePath);
        if (sourceInfo.type !== "File") {
          continue;
        }

        const targetPath = path.join(homeDir, entry);
        const targetIsManagedThroughLink = yield* hasSymlinkAncestor(
          homeDir,
          entry
        );
        if (targetIsManagedThroughLink) {
          continue;
        }

        const targetExists = yield* fs.exists(targetPath);
        if (!targetExists) {
          continue;
        }

        const targetIsLink = yield* pathIsSymlink(targetPath);
        if (targetIsLink) {
          const currentTarget = yield* fs.readLink(targetPath);
          const resolvedTarget = path.resolve(
            path.dirname(targetPath),
            currentTarget
          );
          if (resolvedTarget === sourcePath) {
            yield* fs.remove(targetPath);
          }
          continue;
        }

        const backupPath = path.join(backupRoot, entry);
        yield* fs.makeDirectory(path.dirname(backupPath), { recursive: true });
        yield* fs.rename(targetPath, backupPath);
      }
    }
  }
);

const isManagedHyprlandEntry = (packageName: string, entry: string): boolean =>
  packageName === "linux" &&
  MANAGED_HYPRLAND_FILES.some(
    (fileName) => entry === `.config/hypr/${fileName}`
  );

const SKILLS_SOURCE_SEGMENTS = [".agents", "skills"] as const;
const FOLDED_SKILL_LINKS = [".agents/skills", ".claude/skills"] as const;
const FOLDED_SKILLS_IGNORE = "\\.agents/skills$";
const OMARCHY_THEMES_SEGMENTS = [".config", "omarchy", "themes"] as const;
const FOLDED_OMARCHY_THEMES_IGNORE = "\\.config/omarchy/themes$";
const HYPRLAND_CONFIG_SEGMENTS = [".config", "hypr"] as const;
const MANAGED_HYPRLAND_FILES = [
  "bindings.lua",
  "input.lua",
  "monitors.lua",
] as const;
const MANAGED_HYPRLAND_FILES_IGNORE =
  "\\.config/hypr/(bindings|input|monitors)\\.lua$";
const NODE_MODULES_IGNORE = "(^|/)node_modules($|/)";
