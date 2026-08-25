import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import * as Config from "effect/Config";

const defaultDotfilesDir = () => {
  const workingDirectory = process.cwd();
  const isDotfilesCheckout =
    existsSync(join(workingDirectory, "bin", "dot.ts")) &&
    existsSync(join(workingDirectory, "packages", "Brewfile"));
  return isDotfilesCheckout ? workingDirectory : join(homedir(), ".dotfiles");
};

export interface DotfilesConfigShape {
  readonly brewfilePath: string;
  readonly archAurManifestPath: string;
  readonly archRemoveManifestPath: string;
  readonly archRepoManifestPath: string;
  readonly dotfilesDir: string;
  readonly editorCommand: string;
  readonly homeDir: string;
  readonly localBinDotPath: string;
  readonly piExtensionsDir: string;
  readonly piMcpConfigPath: string;
  readonly piNpmPackage: string;
  readonly piPackageDir: string;
  readonly piSettingsPath: string;
  readonly piVendorDir: string;
  readonly promptConfigPath: string;
  readonly secretsOutputPath: string;
  readonly secretsTemplatePath: string;
  readonly secretsVault: string;
  readonly shellConfigPath: string;
  readonly trackedPiSettingsPath: string;
}

export const DotfilesConfig = Config.all({
  dotfilesDir: Config.string("DOTFILES_DIR").pipe(
    Config.withDefault(defaultDotfilesDir())
  ),
  editorCommand: Config.string("VISUAL").pipe(
    Config.orElse(() => Config.string("EDITOR")),
    Config.withDefault("vi")
  ),
  homeDir: Config.string("HOME").pipe(Config.withDefault(homedir())),
  piNpmPackage: Config.string("DOTFILES_PI_NPM_PACKAGE").pipe(
    Config.withDefault("@earendil-works/pi-coding-agent@0.82.0")
  ),
  secretsVault: Config.string("DOTFILES_SECRETS_VAULT").pipe(
    Config.withDefault("Personal")
  ),
}).pipe(
  Config.map(
    ({
      dotfilesDir,
      editorCommand,
      homeDir,
      piNpmPackage,
      secretsVault,
    }): DotfilesConfigShape => ({
      archAurManifestPath: `${dotfilesDir}/packages/arch.aur`,
      archRemoveManifestPath: `${dotfilesDir}/packages/arch.remove`,
      archRepoManifestPath: `${dotfilesDir}/packages/arch.repo`,
      brewfilePath: `${dotfilesDir}/packages/Brewfile`,
      dotfilesDir,
      editorCommand,
      homeDir,
      localBinDotPath: `${homeDir}/.local/bin/dot`,
      piExtensionsDir: `${homeDir}/.pi/agent/extensions`,
      piMcpConfigPath: `${homeDir}/.pi/agent/mcp.json`,
      piNpmPackage,
      piPackageDir: `${homeDir}/.pi/agent/npm`,
      piSettingsPath: `${homeDir}/.pi/agent/settings.json`,
      piVendorDir: `${dotfilesDir}/vendor/pi`,
      promptConfigPath: `${homeDir}/.p10k.zsh`,
      secretsOutputPath: `${homeDir}/.config/secrets/env.zsh`,
      secretsTemplatePath: `${dotfilesDir}/home/common/.config/zsh/secrets.template.zsh`,
      secretsVault,
      shellConfigPath: `${homeDir}/.zshrc`,
      trackedPiSettingsPath: `${dotfilesDir}/home/common/.pi/agent/settings.json`,
    })
  )
);
