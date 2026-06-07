import * as Effect from "effect/Effect";

import { CommandExecutor } from "../CommandExecutor/index.ts";
import type { ConfigLinkerShape } from "./index.ts";

export const makeStowConfigLinker = Effect.gen(function* () {
  const command = yield* CommandExecutor;
  return {
    linkHome: (dotfilesDir: string, homeDir: string) =>
      command
        .run("stow", [
          "--dir",
          dotfilesDir,
          "--target",
          homeDir,
          "--restow",
          "home",
        ])
        .pipe(Effect.asVoid),
    unlinkHome: (dotfilesDir: string, homeDir: string) =>
      command
        .run("stow", [
          "--dir",
          dotfilesDir,
          "--target",
          homeDir,
          "--delete",
          "home",
        ])
        .pipe(Effect.asVoid),
  } satisfies ConfigLinkerShape;
});
