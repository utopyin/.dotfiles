import * as Context from "effect/Context";
import * as Layer from "effect/Layer";

import { makeBunCommandExecutor } from "./Bun.ts";

export { CommandExecutionError } from "./errors.ts";
export type { CommandExecutorShape, CommandResult } from "./types.ts";

export class CommandExecutor extends Context.Service<CommandExecutor>()(
  "dot/CommandExecutor",
  {
    make: makeBunCommandExecutor,
  }
) {
  static readonly Bun = Layer.effect(this, makeBunCommandExecutor);
}
