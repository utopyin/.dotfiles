import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { DotfilesConfig } from "../../Config.ts";
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
    installIntegrations: Effect.fn("ZshShellSetup.installIntegrations")(
      function* () {
        yield* installOhMyZshIfMissing(ohMyZshDir).pipe(
          Effect.provideService(CommandExecutor, command),
          Effect.provideService(FileSystem.FileSystem, fs)
        );
        for (const plugin of plugins) {
          yield* cloneIfMissing(
            path.join(customDir, "plugins", plugin.name),
            plugin.url
          ).pipe(
            Effect.provideService(CommandExecutor, command),
            Effect.provideService(FileSystem.FileSystem, fs)
          );
        }
        yield* cloneIfMissing(
          path.join(customDir, "themes", "powerlevel10k"),
          "https://github.com/romkatv/powerlevel10k.git",
          ["--depth=1"]
        ).pipe(
          Effect.provideService(CommandExecutor, command),
          Effect.provideService(FileSystem.FileSystem, fs)
        );
      }
    ),
  } satisfies ShellSetupShape;
});

const cloneIfMissing = Effect.fn("ZshShellSetup.cloneIfMissing")(function* (
  destination: string,
  url: string,
  extraArgs: readonly string[] = []
) {
  const command = yield* CommandExecutor;
  const fs = yield* FileSystem.FileSystem;
  return yield* fs
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
});

const installOhMyZshIfMissing = Effect.fn(
  "ZshShellSetup.installOhMyZshIfMissing"
)(function* (ohMyZshDir: string) {
  const command = yield* CommandExecutor;
  const fs = yield* FileSystem.FileSystem;
  return yield* fs
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
});
