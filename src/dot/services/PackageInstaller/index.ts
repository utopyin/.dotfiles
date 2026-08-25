import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type * as PlatformError from "effect/PlatformError";

import type { CommandExecutionError } from "../CommandExecutor/index.ts";
import type { PackageInstallerConfigurationError } from "./errors.ts";
import { makeHomebrewPackageInstaller } from "./Homebrew.ts";
import { makeOmarchyPackageInstaller } from "./Omarchy.ts";

export { PackageInstallerConfigurationError } from "./errors.ts";

export type PackageKind = "aur" | "brew" | "cask" | "mas" | "repo" | "tap";

export interface PackageEntry {
  readonly id?: number;
  readonly kind: PackageKind;
  readonly name: string;
}

export interface PackageInstallerShape {
  readonly managerName: string;
  readonly manifestPaths: readonly string[];
  readonly addToManifest: (
    manifestPath: string,
    entry: PackageEntry
  ) => Effect.Effect<void, PlatformError.PlatformError>;
  readonly applyManifest: (
    manifestPath: string
  ) => Effect.Effect<
    void,
    | CommandExecutionError
    | PackageInstallerConfigurationError
    | PlatformError.PlatformError
  >;
  readonly checkManifest: (
    manifestPath: string
  ) => Effect.Effect<boolean, PlatformError.PlatformError>;
  readonly installSelfIfMissing: () => Effect.Effect<
    void,
    CommandExecutionError
  >;
  readonly isInstalled: () => Effect.Effect<boolean>;
  readonly listManifest: (
    manifestPath: string
  ) => Effect.Effect<
    string,
    CommandExecutionError | PlatformError.PlatformError
  >;
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
    make: makeHomebrewPackageInstaller.pipe(
      Effect.map((installer) => installer as PackageInstallerShape)
    ),
  }
) {
  static readonly Homebrew = Layer.effect(this, makeHomebrewPackageInstaller);
  static readonly Omarchy = Layer.effect(this, makeOmarchyPackageInstaller());
}
