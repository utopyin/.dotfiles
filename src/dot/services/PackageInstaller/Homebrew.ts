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
    addToManifest: Effect.fn("HomebrewPackageInstaller.addToManifest")(
      function* (manifestPath: string, entry: PackageEntry) {
        const manifest = yield* readManifest(manifestPath).pipe(
          Effect.provideService(FileSystem.FileSystem, fs)
        );
        const line = formatHomebrewEntry(entry);
        if (manifest.split("\n").includes(line)) {
          return;
        }
        yield* fs.writeFileString(manifestPath, appendLine(manifest, line));
      }
    ),
    applyManifest: Effect.fn("HomebrewPackageInstaller.applyManifest")(
      function* (manifestPath: string) {
        yield* command
          .run("brew", ["bundle", "--file", manifestPath])
          .pipe(Effect.asVoid);
      }
    ),
    checkManifest: Effect.fn("HomebrewPackageInstaller.checkManifest")(
      function* (manifestPath: string) {
        return yield* command
          .run("brew", ["bundle", "check", "--file", manifestPath])
          .pipe(
            Effect.as(true),
            Effect.catchCause(() => Effect.succeed(false))
          );
      }
    ),
    installSelfIfMissing: Effect.fn(
      "HomebrewPackageInstaller.installSelfIfMissing"
    )(function* () {
      const exists = yield* command.exists("brew");
      if (!exists) {
        yield* command
          .run("/bin/bash", [
            "-c",
            "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)",
          ])
          .pipe(Effect.asVoid);
      }
    }),
    isInstalled: Effect.fn("HomebrewPackageInstaller.isInstalled")(
      function* () {
        return yield* command.exists("brew");
      }
    ),
    listManifest: Effect.fn("HomebrewPackageInstaller.listManifest")(function* (
      manifestPath: string
    ) {
      return yield* command.runText("/bin/sh", [
        "-lc",
        `grep -E '^(brew|cask|mas|tap) ' ${JSON.stringify(manifestPath)} || true`,
      ]);
    }),
    removeFromManifest: Effect.fn(
      "HomebrewPackageInstaller.removeFromManifest"
    )(function* (manifestPath: string, entry: Omit<PackageEntry, "id">) {
      const manifest = yield* readManifest(manifestPath).pipe(
        Effect.provideService(FileSystem.FileSystem, fs)
      );
      const lines = manifest.split("\n");
      const next = lines
        .filter((line) => !matchesHomebrewEntry(line, entry.kind, entry.name))
        .join("\n");
      yield* fs.writeFileString(manifestPath, normalizeTrailingNewline(next));
    }),
    updateAll: Effect.fn("HomebrewPackageInstaller.updateAll")(function* (
      manifestPath: string
    ) {
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

const readManifest = Effect.fn("HomebrewPackageInstaller.readManifest")(
  function* (manifestPath: string) {
    const fs = yield* FileSystem.FileSystem;
    const exists = yield* fs.exists(manifestPath);
    return exists ? yield* fs.readFileString(manifestPath) : "";
  }
);
