import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { CommandExecutor } from "../CommandExecutor/index.ts";
import type { ConfigLinkerShape } from "./index.ts";

export const makeStowConfigLinker = Effect.gen(function* () {
  const command = yield* CommandExecutor;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  return {
    linkHome: Effect.fn("StowConfigLinker.linkHome")(function* (
      dotfilesDir: string,
      homeDir: string
    ) {
      yield* backupConflicts(dotfilesDir, homeDir).pipe(
        Effect.provideService(FileSystem.FileSystem, fs),
        Effect.provideService(Path.Path, path)
      );
      yield* command
        .run("stow", [
          "--dir",
          dotfilesDir,
          "--target",
          homeDir,
          "--no-folding",
          "--ignore",
          "\\.DS_Store$",
          "--ignore",
          NODE_MODULES_IGNORE,
          "--ignore",
          FOLDED_SKILLS_IGNORE,
          "--restow",
          "home",
        ])
        .pipe(Effect.asVoid);

      yield* ensureFoldedSkillLinks(dotfilesDir, homeDir).pipe(
        Effect.provideService(FileSystem.FileSystem, fs),
        Effect.provideService(Path.Path, path)
      );
    }),
    unlinkHome: Effect.fn("StowConfigLinker.unlinkHome")(function* (
      dotfilesDir: string,
      homeDir: string
    ) {
      yield* removeFoldedSkillLinks(homeDir).pipe(
        Effect.provideService(FileSystem.FileSystem, fs),
        Effect.provideService(Path.Path, path)
      );
      yield* command
        .run("stow", [
          "--dir",
          dotfilesDir,
          "--target",
          homeDir,
          "--no-folding",
          "--ignore",
          "\\.DS_Store$",
          "--ignore",
          NODE_MODULES_IGNORE,
          "--ignore",
          FOLDED_SKILLS_IGNORE,
          "--delete",
          "home",
        ])
        .pipe(Effect.asVoid);
    }),
  } satisfies ConfigLinkerShape;
});

const ensureFoldedSkillLinks = Effect.fn(
  "StowConfigLinker.ensureFoldedSkillLinks"
)(function* (dotfilesDir: string, homeDir: string) {
  const path = yield* Path.Path;
  const sourcePath = path.join(dotfilesDir, "home", ...SKILLS_SOURCE_SEGMENTS);

  for (const linkName of FOLDED_SKILL_LINKS) {
    const linkPath = path.join(homeDir, ...linkName.split("/"));
    yield* ensureDirectoryLink(sourcePath, linkPath, homeDir);
  }
});

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

const hasSymlinkAncestor = Effect.fn("StowConfigLinker.hasSymlinkAncestor")(
  function* (homeDir: string, entry: string) {
    const path = yield* Path.Path;
    const segments = entry
      .split(path.sep)
      .filter((segment) => segment.length > 0);
    for (let index = 1; index <= segments.length; index += 1) {
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

const backupConflicts = Effect.fn("StowConfigLinker.backupConflicts")(
  function* (dotfilesDir: string, homeDir: string) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const sourceRoot = path.join(dotfilesDir, "home");
    const entries = yield* fs.readDirectory(sourceRoot, { recursive: true });
    const stamp = new Date().toISOString().replaceAll(/[^0-9A-Za-z]+/gu, "-");
    const backupRoot = path.join(homeDir, ".dotfiles-backups", "stow", stamp);

    for (const entry of entries) {
      if (path.basename(entry) === ".DS_Store") {
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
        continue;
      }

      const backupPath = path.join(backupRoot, entry);
      yield* fs.makeDirectory(path.dirname(backupPath), { recursive: true });
      yield* fs.rename(targetPath, backupPath);
    }
  }
);

const SKILLS_SOURCE_SEGMENTS = [".agents", "skills"] as const;
const FOLDED_SKILL_LINKS = [".agents/skills", ".claude/skills"] as const;
const FOLDED_SKILLS_IGNORE = "\\.agents/skills$";
const NODE_MODULES_IGNORE = "(^|/)node_modules($|/)";
