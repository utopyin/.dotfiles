import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import type { CommandExecutionError } from "../CommandExecutor/index.ts";
import { makeHomebrewPackageInstaller } from "./Homebrew.ts";

export interface PackageInstallerShape {
  readonly isInstalled: () => Effect.Effect<boolean>;
  readonly installSelfIfMissing: () => Effect.Effect<
    void,
    CommandExecutionError
  >;
  readonly applyManifest: (
    manifestPath: string
  ) => Effect.Effect<void, CommandExecutionError>;
  readonly updateAll: (
    manifestPath: string
  ) => Effect.Effect<void, CommandExecutionError>;
  readonly listManifest: (
    manifestPath: string
  ) => Effect.Effect<string, CommandExecutionError>;
}

export class PackageInstaller extends Context.Service<PackageInstaller>()(
  "dot/PackageInstaller",
  {
    make: makeHomebrewPackageInstaller,
  }
) {
  static readonly Homebrew = Layer.effect(this, makeHomebrewPackageInstaller);
}
