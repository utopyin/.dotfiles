import * as Effect from "effect/Effect";

import { CommandExecutor } from "../CommandExecutor/index.ts";
import type { PackageInstallerShape } from "./index.ts";

export const makeHomebrewPackageInstaller = Effect.gen(function* () {
  const command = yield* CommandExecutor;
  return {
    applyManifest: (manifestPath: string) =>
      command
        .run("brew", ["bundle", "--file", manifestPath])
        .pipe(Effect.asVoid),
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
