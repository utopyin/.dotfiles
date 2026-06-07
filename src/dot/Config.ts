import { homedir } from "node:os";

import * as Config from "effect/Config";

export interface DotfilesConfigShape {
  readonly brewfilePath: string;
  readonly dotfilesDir: string;
  readonly editorCommand: string;
  readonly homeDir: string;
  readonly localBinDotPath: string;
  readonly piMcpConfigPath: string;
  readonly piNpmPackage: string;
  readonly piPackageDir: string;
  readonly piSettingsPath: string;
  readonly promptConfigPath: string;
  readonly secretsOutputPath: string;
  readonly secretsTemplatePath: string;
  readonly secretsVault: string;
  readonly shellConfigPath: string;
}

export const DotfilesConfig = Config.all({
  dotfilesDir: Config.string("DOTFILES_DIR").pipe(
    Config.withDefault(`${homedir()}/.dotfiles`)
  ),
  editorCommand: Config.string("VISUAL").pipe(
    Config.orElse(() => Config.string("EDITOR")),
    Config.withDefault("vi")
  ),
  homeDir: Config.string("HOME").pipe(Config.withDefault(homedir())),
  piNpmPackage: Config.string("DOTFILES_PI_NPM_PACKAGE").pipe(
    Config.withDefault("@earendil-works/pi-coding-agent@0.78.1")
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
      brewfilePath: `${dotfilesDir}/packages/Brewfile`,
      dotfilesDir,
      editorCommand,
      homeDir,
      localBinDotPath: `${homeDir}/.local/bin/dot`,
      piMcpConfigPath: `${homeDir}/.pi/agent/mcp.json`,
      piNpmPackage,
      piPackageDir: `${homeDir}/.pi/agent/npm`,
      piSettingsPath: `${homeDir}/.pi/agent/settings.json`,
      promptConfigPath: `${homeDir}/.p10k.zsh`,
      secretsOutputPath: `${homeDir}/.config/secrets/env.zsh`,
      secretsTemplatePath: `${dotfilesDir}/home/.config/zsh/secrets.template.zsh`,
      secretsVault,
      shellConfigPath: `${homeDir}/.zshrc`,
    })
  )
);
