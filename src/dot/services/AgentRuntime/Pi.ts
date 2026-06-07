import * as Effect from "effect/Effect";

import { CommandExecutor } from "../CommandExecutor/index.ts";
import type { AgentRuntimeShape } from "./index.ts";

export const makePiAgentRuntime = Effect.gen(function* () {
  const command = yield* CommandExecutor;
  return {
    isInstalled: () => command.exists("pi"),
    update: () => command.run("pi", ["update"]).pipe(Effect.asVoid),
  } satisfies AgentRuntimeShape;
});
