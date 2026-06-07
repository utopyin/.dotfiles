import * as Effect from "effect/Effect";

import { CommandExecutor } from "../CommandExecutor/index.ts";
import type { FileVersioningShape } from "./index.ts";

export const makeGitFileVersioning = Effect.gen(function* () {
  const command = yield* CommandExecutor;
  return {
    pullFastForward: (cwd: string) =>
      command.run("git", ["pull", "--ff-only"], { cwd }).pipe(Effect.asVoid),
    remoteSummary: (cwd: string) =>
      command.runText("git", ["remote", "-v"], { cwd }),
    status: (cwd: string) =>
      command.runText("git", ["status", "--short", "--branch"], { cwd }),
  } satisfies FileVersioningShape;
});
