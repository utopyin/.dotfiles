import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";

import { CommandExecutor } from "../CommandExecutor/index.ts";
import type {
  PackageEntry,
  PackageInstallerShape,
  PackageKind,
} from "./index.ts";

export const makeHomebrewPackageInstaller = Effect.gen(function* () {
  const command = yield* CommandExecutor;
  const fs = yield* FileSystem.FileSystem;

  return {
    addToManifest: (manifestPath: string, entry: PackageEntry) =>
      Effect.gen(function* () {
        const manifest = yield* readManifest(fs, manifestPath);
        const line = formatHomebrewEntry(entry);
        if (manifest.split("\n").includes(line)) {
          return;
        }
        yield* fs.writeFileString(manifestPath, appendLine(manifest, line));
      }),
    applyManifest: (manifestPath: string) =>
      command
        .run("brew", ["bundle", "--file", manifestPath])
        .pipe(Effect.asVoid),
    checkManifest: (manifestPath: string) =>
      command.run("brew", ["bundle", "check", "--file", manifestPath]).pipe(
        Effect.as(true),
        Effect.catchCause(() => Effect.succeed(false))
      ),
    installSelfIfMissing: () =>
      command
        .exists("brew")
        .pipe(
          Effect.flatMap((exists) =>
            exists
              ? Effect.void
              : command
                  .run("/bin/bash", [
                    "-c",
                    "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)",
                  ])
                  .pipe(Effect.asVoid)
          )
        ),
    isInstalled: () => command.exists("brew"),
    listManifest: (manifestPath: string) =>
      command.runText("/bin/sh", [
        "-lc",
        `grep -E '^(brew|cask|mas|tap) ' ${JSON.stringify(manifestPath)} || true`,
      ]),
    removeFromManifest: (
      manifestPath: string,
      entry: Omit<PackageEntry, "id">
    ) =>
      Effect.gen(function* () {
        const manifest = yield* readManifest(fs, manifestPath);
        const lines = manifest.split("\n");
        const next = lines
          .filter((line) => !matchesHomebrewEntry(line, entry.kind, entry.name))
          .join("\n");
        yield* fs.writeFileString(manifestPath, normalizeTrailingNewline(next));
      }),
    updateAll: (manifestPath: string) =>
      Effect.gen(function* () {
        yield* command.run("brew", ["update"]);
        yield* command.run("brew", ["bundle", "--file", manifestPath]);
        yield* command
          .run("brew", ["upgrade"])
          .pipe(Effect.catchCause(() => Effect.void));
      }),
  } satisfies PackageInstallerShape;
});

const appendLine = (content: string, line: string) =>
  content.trimEnd().length === 0
    ? `${line}\n`
    : `${content.trimEnd()}\n${line}\n`;

const formatHomebrewEntry = (entry: PackageEntry) => {
  const name = JSON.stringify(entry.name);
  if (entry.kind === "mas") {
    return entry.id === undefined
      ? `mas ${name}`
      : `mas ${name}, id: ${entry.id}`;
  }
  return `${entry.kind} ${name}`;
};

const matchesHomebrewEntry = (
  line: string,
  kind: PackageKind,
  name: string
) => {
  const trimmed = line.trim();
  return (
    trimmed.startsWith(`${kind} ${JSON.stringify(name)}`) ||
    trimmed.startsWith(`${kind} '${name.replaceAll("'", "\\'")}'`)
  );
};

const normalizeTrailingNewline = (content: string) =>
  content.trimEnd().length === 0 ? "" : `${content.trimEnd()}\n`;

const readManifest = (fs: FileSystem.FileSystem, manifestPath: string) =>
  fs
    .exists(manifestPath)
    .pipe(
      Effect.flatMap((exists) =>
        exists ? fs.readFileString(manifestPath) : Effect.succeed("")
      )
    );
