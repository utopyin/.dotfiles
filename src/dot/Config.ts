import { homedir } from "node:os";

import * as Config from "effect/Config";

export interface DotfilesConfigShape {
  readonly brewfilePath: string;
  readonly dotfilesDir: string;
  readonly editorCommand: string;
  readonly homeDir: string;
  readonly localBinDotPath: string;
  readonly secretsOutputPath: string;
  readonly secretsTemplatePath: string;
  readonly secretsVault: string;
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
  secretsVault: Config.string("DOTFILES_SECRETS_VAULT").pipe(
    Config.withDefault("Personal")
  ),
}).pipe(
  Config.map(
    ({
      dotfilesDir,
      editorCommand,
      homeDir,
      secretsVault,
    }): DotfilesConfigShape => ({
      brewfilePath: `${dotfilesDir}/Brewfile`,
      dotfilesDir,
      editorCommand,
      homeDir,
      localBinDotPath: `${homeDir}/.local/bin/dot`,
      secretsOutputPath: `${homeDir}/.config/secrets/env.zsh`,
      secretsTemplatePath: `${dotfilesDir}/home/.config/zsh/secrets.template.zsh`,
      secretsVault,
    })
  )
);
