import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type * as PlatformError from "effect/PlatformError";

import type { CommandExecutionError } from "../CommandExecutor/index.ts";
import { makeHomebrewPackageInstaller } from "./Homebrew.ts";

export type PackageKind = "brew" | "cask" | "mas" | "tap";

export interface PackageEntry {
  readonly id?: number;
  readonly kind: PackageKind;
  readonly name: string;
}

export interface PackageInstallerShape {
  readonly addToManifest: (
    manifestPath: string,
    entry: PackageEntry
  ) => Effect.Effect<void, PlatformError.PlatformError>;
  readonly applyManifest: (
    manifestPath: string
  ) => Effect.Effect<void, CommandExecutionError>;
  readonly installSelfIfMissing: () => Effect.Effect<
    void,
    CommandExecutionError
  >;
  readonly isInstalled: () => Effect.Effect<boolean>;
  readonly listManifest: (
    manifestPath: string
  ) => Effect.Effect<string, CommandExecutionError>;
  readonly removeFromManifest: (
    manifestPath: string,
    entry: Omit<PackageEntry, "id">
  ) => Effect.Effect<void, PlatformError.PlatformError>;
  readonly updateAll: (
    manifestPath: string
  ) => Effect.Effect<void, CommandExecutionError>;
}

export class PackageInstaller extends Context.Service<PackageInstaller>()(
  "dot/PackageInstaller",
  {
    make: makeHomebrewPackageInstaller,
  }
) {
  static readonly Homebrew = Layer.effect(this, makeHomebrewPackageInstaller);
}
