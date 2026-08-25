import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type * as PlatformError from "effect/PlatformError";

import type { CommandExecutionError } from "../CommandExecutor/index.ts";
import type { HyprlandConfigError } from "./errors.ts";
import { makeStowConfigLinker } from "./Stow.ts";

export { HyprlandConfigError } from "./errors.ts";

export interface ConfigLinkerShape {
  readonly linkHome: (
    dotfilesDir: string,
    homeDir: string
  ) => Effect.Effect<
    void,
    CommandExecutionError | HyprlandConfigError | PlatformError.PlatformError
  >;
  readonly unlinkHome: (
    dotfilesDir: string,
    homeDir: string
  ) => Effect.Effect<void, CommandExecutionError | PlatformError.PlatformError>;
}

export class ConfigLinker extends Context.Service<ConfigLinker>()(
  "dot/ConfigLinker",
  {
    make: makeStowConfigLinker,
  }
) {
  static readonly Stow = Layer.effect(this, makeStowConfigLinker);
}
