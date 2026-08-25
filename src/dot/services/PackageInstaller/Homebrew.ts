import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";

import { DotfilesConfig } from "../../Config.ts";
import { CommandExecutor } from "../CommandExecutor/index.ts";
import type {
  PackageEntry,
  PackageInstallerShape,
  PackageKind,
} from "./index.ts";

export const makeHomebrewPackageInstaller = Effect.gen(function* () {
  const command = yield* CommandExecutor;
  const config = yield* DotfilesConfig;
  const fs = yield* FileSystem.FileSystem;

  // Native package APIs intentionally share a stable service key order.
  // oxlint-disable-next-line sort-keys
  return {
    managerName: "Homebrew",
    manifestPaths: [config.brewfilePath],
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
        yield* trustManifestTaps(manifestPath).pipe(
          Effect.provideService(CommandExecutor, command)
        );
        yield* command.runInteractive("brew", [
          "bundle",
          "--file",
          manifestPath,
        ]);
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
      yield* command.runInteractive("brew", ["update"]);
      yield* trustManifestTaps(manifestPath).pipe(
        Effect.provideService(CommandExecutor, command)
      );
      yield* command.runInteractive("brew", ["bundle", "--file", manifestPath]);
      yield* command
        .runInteractive("brew", ["upgrade"])
        .pipe(Effect.catchCause(() => Effect.void));
    }),
  } satisfies PackageInstallerShape;
});

const appendLine = (content: string, line: string) =>
  content.trimEnd().length === 0
    ? `${line}\n`
    : `${content.trimEnd()}\n${line}\n`;

const trustManifestTaps = Effect.fn(
  "HomebrewPackageInstaller.trustManifestTaps"
)(function* (manifestPath: string) {
  const command = yield* CommandExecutor;
  yield* command
    .run("/bin/sh", [
      "-lc",
      TRUST_MANIFEST_TAPS_SCRIPT,
      "dot-brew-trust",
      manifestPath,
    ])
    .pipe(Effect.catchCause(() => Effect.void));
});

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

const TRUST_MANIFEST_TAPS_SCRIPT = String.raw`
manifest=$1
[ -f "$manifest" ] || exit 0
brew help trust >/dev/null 2>&1 || exit 0
awk '
  /^[[:space:]]*tap[[:space:]]+/ {
    line=$0
    sub(/^[[:space:]]*tap[[:space:]]+/, "", line)
    sub(/#.*/, "", line)
    gsub(/^[[:space:]]+|[[:space:]]+$/, "", line)
    if (line ~ /^"/) {
      sub(/^"/, "", line)
      sub(/".*$/, "", line)
    } else {
      sub(/[[:space:],].*$/, "", line)
    }
    if (line != "" && line !~ /^homebrew\//) print line
  }
' "$manifest" | while IFS= read -r tap; do
  brew trust --tap "$tap" >/dev/null 2>&1 || true
done
`;

const readManifest = Effect.fn("HomebrewPackageInstaller.readManifest")(
  function* (manifestPath: string) {
    const fs = yield* FileSystem.FileSystem;
    const exists = yield* fs.exists(manifestPath);
    return exists ? yield* fs.readFileString(manifestPath) : "";
  }
);
