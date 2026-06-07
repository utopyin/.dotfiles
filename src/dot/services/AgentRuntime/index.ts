import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import type { CommandExecutionError } from "../CommandExecutor/index.ts";
import { makePiAgentRuntime } from "./Pi.ts";

export interface AgentRuntimeShape {
  readonly isInstalled: () => Effect.Effect<boolean>;
  readonly update: () => Effect.Effect<void, CommandExecutionError>;
}

export class AgentRuntime extends Context.Service<AgentRuntime>()(
  "dot/AgentRuntime",
  {
    make: makePiAgentRuntime,
  }
) {
  static readonly Pi = Layer.effect(this, makePiAgentRuntime);
}
