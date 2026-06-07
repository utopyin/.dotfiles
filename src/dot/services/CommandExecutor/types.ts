import type * as Effect from "effect/Effect";

import type { CommandExecutionError } from "./errors.ts";

export interface CommandResult {
  readonly args: readonly string[];
  readonly command: string;
  readonly exitCode: number;
  readonly stderr: string;
  readonly stdout: string;
}

export interface CommandExecutorShape {
  readonly exists: (command: string) => Effect.Effect<boolean>;
  readonly run: (
    command: string,
    args?: readonly string[],
    options?: { readonly cwd?: string }
  ) => Effect.Effect<CommandResult, CommandExecutionError>;
  readonly runText: (
    command: string,
    args?: readonly string[],
    options?: { readonly cwd?: string }
  ) => Effect.Effect<string, CommandExecutionError>;
}
