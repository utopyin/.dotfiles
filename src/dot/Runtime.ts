import { BunServices } from "@effect/platform-bun";
import * as Layer from "effect/Layer";

import { AgentRuntime } from "./services/AgentRuntime/index.ts";
import { BinaryLinker } from "./services/BinaryLinker.ts";
import { CommandExecutor } from "./services/CommandExecutor/index.ts";
import { ConfigLinker } from "./services/ConfigLinker/index.ts";
import { FileVersioning } from "./services/FileVersioning/index.ts";
import { PackageInstaller } from "./services/PackageInstaller/index.ts";
import { PiExtensionVendor } from "./services/PiExtensionVendor.ts";
import { SecretManager } from "./services/SecretManager/index.ts";
import { Secrets } from "./services/Secrets.ts";
import { SecretValueInput } from "./services/SecretValueInput/index.ts";
import { ShellSetup } from "./services/ShellSetup/index.ts";
import { Workspace } from "./services/Workspace.ts";

const Core = CommandExecutor.Bun.pipe(Layer.provideMerge(BunServices.layer));

const Implementations = Layer.mergeAll(
  FileVersioning.Git,
  PackageInstaller.Homebrew,
  ConfigLinker.Stow,
  AgentRuntime.Pi,
  ShellSetup.Zsh,
  SecretManager.OnePassword,
  SecretValueInput.Bun
).pipe(Layer.provideMerge(Core));

export const Live = Layer.mergeAll(
  BinaryLinker.Live,
  PiExtensionVendor.Live,
  Secrets.Live,
  Workspace.Live
).pipe(Layer.provideMerge(Implementations));
