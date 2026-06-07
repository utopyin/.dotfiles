import * as Effect from "effect/Effect";

import { DotfilesConfig } from "../../Config.ts";
import { CommandExecutor } from "../CommandExecutor/index.ts";
import type { AgentRuntimeShape } from "./index.ts";

export const makePiAgentRuntime = Effect.gen(function* () {
  const command = yield* CommandExecutor;
  const config = yield* DotfilesConfig;

  return {
    installPackageDeps: (packageDir: string) =>
      command
        .run("npm", ["install", "--prefix", packageDir])
        .pipe(Effect.asVoid),
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
