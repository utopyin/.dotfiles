import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { DotfilesConfig } from "../../Config.ts";
import { CommandExecutor } from "../CommandExecutor/index.ts";
import type { AgentRuntimeShape } from "./index.ts";

export interface ExtensionPackageDirs {
  readonly installDir: string;
  readonly liveDir: string;
}

export const discoverExtensionPackageDirs = Effect.fn(
  "PiAgentRuntime.discoverExtensionPackageDirs"
)(function* (extensionsDir: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const exists = yield* fs.exists(extensionsDir);
  if (!exists) {
    return [];
  }

  const packageDirs: ExtensionPackageDirs[] = [];
  for (const entry of yield* fs.readDirectory(extensionsDir)) {
    const discoveredPackageDir = path.join(extensionsDir, entry);
    const packageInfo = yield* fs.stat(discoveredPackageDir);
    if (packageInfo.type !== "Directory") {
      continue;
    }

    const packageJsonPath = path.join(discoveredPackageDir, "package.json");
    if (!(yield* fs.exists(packageJsonPath))) {
      continue;
    }

    const packageJson = yield* fs.readFileString(packageJsonPath);
    if (hasRuntimeDependencies(packageJson)) {
      const realPackageJsonPath = yield* fs.realPath(packageJsonPath);
      packageDirs.push({
        installDir: path.dirname(realPackageJsonPath),
        liveDir: yield* fs.realPath(discoveredPackageDir),
      });
    }
  }

  return packageDirs.toSorted((left, right) =>
    left.liveDir.localeCompare(right.liveDir)
  );
});

export const linkExtensionNodeModules = Effect.fn(
  "PiAgentRuntime.linkExtensionNodeModules"
)(function* ({ installDir, liveDir }: ExtensionPackageDirs) {
  if (installDir === liveDir) {
    return;
  }

  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const liveNodeModules = path.join(liveDir, "node_modules");
  const installedNodeModules = path.join(installDir, "node_modules");
  yield* fs.remove(liveNodeModules, { force: true, recursive: true });
  yield* fs.symlink(
    path.relative(liveDir, installedNodeModules),
    liveNodeModules
  );
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
      .run("npm", ["install", "--omit=dev", "--prefix", packageDir])
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
        Effect.provideService(Path.Path, path)
      );
      for (const packageDir of packageDirs) {
        yield* installRuntimePackageDeps(packageDir.installDir);
        yield* linkExtensionNodeModules(packageDir).pipe(
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.provideService(Path.Path, path)
        );
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
