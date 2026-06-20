import * as Effect from "effect/Effect";

import { CommandExecutor } from "../CommandExecutor/index.ts";
import type { FileVersioningShape } from "./index.ts";

export const makeGitFileVersioning = Effect.gen(function* () {
  const command = yield* CommandExecutor;
  return {
    pullFastForward: Effect.fn("GitFileVersioning.pullFastForward")(function* (
      cwd: string
    ) {
      yield* command.runInteractive("git", ["pull", "--ff-only"], { cwd });
    }),
    remoteSummary: Effect.fn("GitFileVersioning.remoteSummary")(function* (
      cwd: string
    ) {
      return yield* command.runText("git", ["remote", "-v"], { cwd });
    }),
    status: Effect.fn("GitFileVersioning.status")(function* (cwd: string) {
      return yield* command.runText("git", ["status", "--short", "--branch"], {
        cwd,
      });
    }),
  } satisfies FileVersioningShape;
});
