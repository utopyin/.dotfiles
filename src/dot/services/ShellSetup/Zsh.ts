import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { DotfilesConfig } from "../../Config.ts";
import type { CommandExecutorShape } from "../CommandExecutor/index.ts";
import { CommandExecutor } from "../CommandExecutor/index.ts";
import type { ShellSetupShape } from "./index.ts";

const ohMyZshInstallUrl =
  "https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh";

const plugins = [
  {
    name: "zsh-autosuggestions",
    url: "https://github.com/zsh-users/zsh-autosuggestions",
  },
  {
    name: "zsh-syntax-highlighting",
    url: "https://github.com/zsh-users/zsh-syntax-highlighting.git",
  },
] as const;

export const makeZshShellSetup = Effect.gen(function* () {
  const command = yield* CommandExecutor;
  const config = yield* DotfilesConfig;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const ohMyZshDir = path.join(config.homeDir, ".oh-my-zsh");
  const customDir = path.join(ohMyZshDir, "custom");

  return {
    installIntegrations: () =>
      Effect.gen(function* () {
        yield* installOhMyZshIfMissing(command, fs, ohMyZshDir);
        for (const plugin of plugins) {
          yield* cloneIfMissing(
            command,
            fs,
            path.join(customDir, "plugins", plugin.name),
            plugin.url
          );
        }
        yield* cloneIfMissing(
          command,
          fs,
          path.join(customDir, "themes", "powerlevel10k"),
          "https://github.com/romkatv/powerlevel10k.git",
          ["--depth=1"]
        );
      }),
  } satisfies ShellSetupShape;
});

const cloneIfMissing = (
  command: CommandExecutorShape,
  fs: FileSystem.FileSystem,
  destination: string,
  url: string,
  extraArgs: readonly string[] = []
) =>
  fs
    .exists(destination)
    .pipe(
      Effect.flatMap((exists) =>
        exists
          ? Effect.void
          : command
              .run("git", ["clone", ...extraArgs, url, destination])
              .pipe(Effect.asVoid)
      )
    );

const installOhMyZshIfMissing = (
  command: CommandExecutorShape,
  fs: FileSystem.FileSystem,
  ohMyZshDir: string
) =>
  fs
    .exists(ohMyZshDir)
    .pipe(
      Effect.flatMap((exists) =>
        exists
          ? Effect.void
          : command
              .run("/bin/sh", [
                "-lc",
                `RUNZSH=no CHSH=no KEEP_ZSHRC=yes sh -c "$(curl -fsSL ${ohMyZshInstallUrl})"`,
              ])
              .pipe(Effect.asVoid)
      )
    );
