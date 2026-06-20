import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { DotfilesConfig } from "../../Config.ts";
import { CommandExecutor } from "../CommandExecutor/index.ts";
import type { AgentRuntimeShape } from "./index.ts";

const discoverExtensionPackageDirs = Effect.fn(
  "PiAgentRuntime.discoverExtensionPackageDirs"
)(function* (extensionsDir: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
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
});

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

  const installPackageDeps = Effect.fn("PiAgentRuntime.installPackageDeps")(
    function* (packageDir: string) {
      yield* command
        .run("npm", ["install", "--prefix", packageDir])
        .pipe(Effect.asVoid);
    }
  );

  const installRuntimePackageDeps = Effect.fn(
    "PiAgentRuntime.installRuntimePackageDeps"
  )(function* (packageDir: string) {
    yield* command
      .run("npm", [
        "install",
        "--omit=dev",
        "--omit=peer",
        "--prefix",
        packageDir,
      ])
      .pipe(Effect.asVoid);
  });

  return {
    installExtensionPackageDeps: Effect.fn(
      "PiAgentRuntime.installExtensionPackageDeps"
    )(function* (extensionsDir: string) {
      const packageDirs = yield* discoverExtensionPackageDirs(
        extensionsDir
      ).pipe(
        Effect.provideService(FileSystem.FileSystem, fs),
        Effect.provideService(Path.Path, path),
        Effect.catchCause(() => Effect.succeed([]))
      );
      for (const packageDir of packageDirs) {
        yield* installRuntimePackageDeps(packageDir);
      }
    }),
    installPackageDeps,
    installSelfIfMissing: Effect.fn("PiAgentRuntime.installSelfIfMissing")(
      function* () {
        const exists = yield* command.exists("pi");
        if (!exists) {
          yield* command
            .run("npm", ["install", "--global", config.piNpmPackage])
            .pipe(Effect.asVoid);
        }
      }
    ),
    isInstalled: Effect.fn("PiAgentRuntime.isInstalled")(function* () {
      return yield* command.exists("pi");
    }),
    update: Effect.fn("PiAgentRuntime.update")(function* () {
      yield* command.runInteractive("pi", ["update"]);
    }),
  } satisfies AgentRuntimeShape;
});
