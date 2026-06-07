import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import type { CommandExecutionError } from "../CommandExecutor/index.ts";
import { makeGitFileVersioning } from "./Git.ts";

export interface FileVersioningShape {
  readonly status: (
    cwd: string
  ) => Effect.Effect<string, CommandExecutionError>;
  readonly pullFastForward: (
    cwd: string
  ) => Effect.Effect<void, CommandExecutionError>;
  readonly remoteSummary: (
    cwd: string
  ) => Effect.Effect<string, CommandExecutionError>;
}

export class FileVersioning extends Context.Service<FileVersioning>()(
  "dot/FileVersioning",
  {
    make: makeGitFileVersioning,
  }
) {
  static readonly Git = Layer.effect(this, makeGitFileVersioning);
}
