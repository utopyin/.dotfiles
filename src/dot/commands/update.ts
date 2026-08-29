import * as Console from "effect/Console";
import * as Effect from "effect/Effect";

import { DotfilesConfig } from "../Config.ts";
import { AgentRuntime } from "../services/AgentRuntime/index.ts";
import { CommandExecutor } from "../services/CommandExecutor/index.ts";
import { FileVersioning } from "../services/FileVersioning/index.ts";
import { PackageInstaller } from "../services/PackageInstaller/index.ts";
import { applyConfig } from "./stow.ts";

export const update = Effect.fn("update")(function* () {
  const config = yield* DotfilesConfig;
  const commands = yield* CommandExecutor;
  const vcs = yield* FileVersioning;
  const packages = yield* PackageInstaller;
  const agent = yield* AgentRuntime;

  yield* Console.log("Updating dotfiles repo...");
  yield* vcs
    .pullFastForward(config.dotfilesDir)
    .pipe(
      Effect.catchCause((cause) =>
        Console.log(`git pull skipped/failed: ${cause.toString()}`)
      )
    );

  yield* Console.log(`Updating ${packages.managerName} packages...`);
  yield* packages.updateAll(packages.manifestPaths[0] ?? "");

  if (yield* agent.isInstalled()) {
    yield* Console.log("Updating Pi runtime...");
    yield* agent
      .update()
      .pipe(
        Effect.catchCause((cause) =>
          Console.log(`pi update failed: ${cause.toString()}`)
        )
      );
  }

  yield* Console.log("Applying dotfiles config...");
  yield* applyConfig();

  yield* Console.log("Installing mise tools...");
  yield* commands.runInteractive("mise", ["install"], {
    cwd: config.homeDir,
  });

  yield* Console.log("Installing Pi extension dependencies...");
  yield* agent.installExtensionPackageDeps(config.piExtensionsDir);

  yield* Console.log("Update complete");
});
