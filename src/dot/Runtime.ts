import { BunServices } from "@effect/platform-bun";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { AgentRuntime } from "./services/AgentRuntime/index.ts";
import { BinaryLinker } from "./services/BinaryLinker.ts";
import { CommandExecutor } from "./services/CommandExecutor/index.ts";
import { ConfigLinker } from "./services/ConfigLinker/index.ts";
import { FileVersioning } from "./services/FileVersioning/index.ts";
import { makeHomebrewPackageInstaller } from "./services/PackageInstaller/Homebrew.ts";
import { PackageInstaller } from "./services/PackageInstaller/index.ts";
import { makeOmarchyPackageInstaller } from "./services/PackageInstaller/Omarchy.ts";
import { PiExtensionVendor } from "./services/PiExtensionVendor.ts";
import {
  PlatformInfo,
  UnsupportedPlatformError,
} from "./services/PlatformInfo.ts";
import { SecretManager } from "./services/SecretManager/index.ts";
import { Secrets } from "./services/Secrets.ts";
import { SecretValueInput } from "./services/SecretValueInput/index.ts";
import { ShellSetup } from "./services/ShellSetup/index.ts";
import { Workspace } from "./services/Workspace.ts";

const Core = CommandExecutor.Bun.pipe(Layer.provideMerge(BunServices.layer));

const Platform = PlatformInfo.Live.pipe(Layer.provideMerge(BunServices.layer));

const SelectedPackageInstaller = Layer.effect(
  PackageInstaller,
  Effect.gen(function* () {
    const platform = yield* PlatformInfo;
    if (platform.os === "darwin") {
      return yield* makeHomebrewPackageInstaller;
    }
    if (platform.distroId === "omarchy") {
      return yield* makeOmarchyPackageInstaller();
    }
    return yield* new UnsupportedPlatformError({
      detectedPlatform: `${platform.os}/${platform.distroId ?? "unknown"}`,
    });
  })
);

const Implementations = Layer.mergeAll(
  FileVersioning.Git,
  ConfigLinker.Stow,
  AgentRuntime.Pi,
  ShellSetup.Zsh,
  SecretManager.OnePassword,
  SecretValueInput.Bun
).pipe(Layer.provideMerge(Core), Layer.provideMerge(Platform));

const WithPackages = SelectedPackageInstaller.pipe(
  Layer.provideMerge(Implementations)
);

export const Live = Layer.mergeAll(
  BinaryLinker.Live,
  PiExtensionVendor.Live,
  Secrets.Live,
  Workspace.Live
).pipe(Layer.provideMerge(WithPackages));
