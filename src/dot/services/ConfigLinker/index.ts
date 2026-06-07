import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import type { CommandExecutionError } from "../CommandExecutor/index.ts";
import { makeStowConfigLinker } from "./Stow.ts";

export interface ConfigLinkerShape {
  readonly linkHome: (
    dotfilesDir: string,
    homeDir: string
  ) => Effect.Effect<void, CommandExecutionError>;
  readonly unlinkHome: (
    dotfilesDir: string,
    homeDir: string
  ) => Effect.Effect<void, CommandExecutionError>;
}

export class ConfigLinker extends Context.Service<ConfigLinker>()(
  "dot/ConfigLinker",
  {
    make: makeStowConfigLinker,
  }
) {
  static readonly Stow = Layer.effect(this, makeStowConfigLinker);
}
