import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { DotfilesConfig } from "../../Config.ts";
import { CommandExecutor } from "../CommandExecutor/index.ts";
import type { AgentRuntimeShape } from "./index.ts";

const discoverExtensionPackageDirs = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  extensionsDir: string
) =>
  Effect.gen(function* () {
    const exists = yield* fs.exists(extensionsDir);
    if (!exists) {
      return [];
    }

    const packageDirs: string[] = [];
    for (const entry of yield* fs.readDirectory(extensionsDir)) {
      const packageDir = path.join(extensionsDir, entry);
      const packageJsonPath = path.join(packageDir, "package.json");
      if (!(yield* fs.exists(packageJsonPath))) {
        continue;
      }

      const packageJson = yield* fs.readFileString(packageJsonPath);
      if (hasRuntimeDependencies(packageJson)) {
        packageDirs.push(packageDir);
      }
    }

    return packageDirs.toSorted();
  }).pipe(Effect.catchCause(() => Effect.succeed([])));

const hasRuntimeDependencies = (packageJson: string) => {
  try {
    const { dependencies } = JSON.parse(packageJson) as {
      dependencies?: unknown;
    };
    return (
      typeof dependencies === "object" &&
      dependencies !== null &&
      Object.keys(dependencies).length > 0
    );
  } catch {
    return false;
  }
};

export const makePiAgentRuntime = Effect.gen(function* () {
  const command = yield* CommandExecutor;
  const config = yield* DotfilesConfig;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const installPackageDeps = (packageDir: string) =>
    command.run("npm", ["install", "--prefix", packageDir]).pipe(Effect.asVoid);

  const installRuntimePackageDeps = (packageDir: string) =>
    command
      .run("npm", [
        "install",
        "--omit=dev",
        "--omit=peer",
        "--prefix",
        packageDir,
      ])
      .pipe(Effect.asVoid);

  return {
    installExtensionPackageDeps: (extensionsDir: string) =>
      Effect.gen(function* () {
        const packageDirs = yield* discoverExtensionPackageDirs(
          fs,
          path,
          extensionsDir
        );
        for (const packageDir of packageDirs) {
          yield* installRuntimePackageDeps(packageDir);
        }
      }),
    installPackageDeps,
    installSelfIfMissing: () =>
      command
        .exists("pi")
        .pipe(
          Effect.flatMap((exists) =>
            exists
              ? Effect.void
              : command
                  .run("npm", ["install", "--global", config.piNpmPackage])
                  .pipe(Effect.asVoid)
          )
        ),
    isInstalled: () => command.exists("pi"),
    update: () => command.run("pi", ["update"]).pipe(Effect.asVoid),
  } satisfies AgentRuntimeShape;
});
