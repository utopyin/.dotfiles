import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type * as PlatformError from "effect/PlatformError";

import type { CommandExecutionError } from "../CommandExecutor/index.ts";
import { makeZshShellSetup } from "./Zsh.ts";

export interface ShellSetupShape {
  readonly installIntegrations: () => Effect.Effect<
    void,
    CommandExecutionError | PlatformError.PlatformError
  >;
}

export class ShellSetup extends Context.Service<ShellSetup>()(
  "dot/ShellSetup",
  {
    make: makeZshShellSetup,
  }
) {
  static readonly Zsh = Layer.effect(this, makeZshShellSetup);
}
