import * as Console from "effect/Console";
import * as Effect from "effect/Effect";

import { DotfilesConfig } from "../Config.ts";
import { AgentRuntime } from "../services/AgentRuntime/index.ts";
import { BinaryLinker } from "../services/BinaryLinker.ts";
import { CommandExecutor } from "../services/CommandExecutor/index.ts";
import { GitSetup } from "../services/GitSetup.ts";
import { PackageInstaller } from "../services/PackageInstaller/index.ts";
import { ShellSetup } from "../services/ShellSetup/index.ts";
import { isZshPath } from "../services/ShellSetup/Zsh.ts";
import { doctor } from "./doctor.ts";
import { applyConfig } from "./stow.ts";

const miseInstallUrl = "https://mise.run";

// Package managers without a mise package rely on the official installer,
// which places the binary in ~/.local/bin.
const installMiseIfMissing = Effect.fn("init.installMiseIfMissing")(
  function* () {
    const commands = yield* CommandExecutor;
    if (yield* commands.exists("mise")) {
      return;
    }
    yield* Console.log("Installing mise...");
    yield* commands.runInteractive("/bin/sh", [
      "-c",
      `curl -fsSL ${miseInstallUrl} | sh`,
    ]);
  }
);

export interface InitOptions {
  readonly unattended: boolean;
}

export const init = Effect.fn("init")(function* (options: InitOptions) {
  const config = yield* DotfilesConfig;
  const agent = yield* AgentRuntime;
  const commands = yield* CommandExecutor;
  const linker = yield* BinaryLinker;
  const git = yield* GitSetup;
  const packages = yield* PackageInstaller;
  const shell = yield* ShellSetup;
  yield* Console.log(`Installing ${packages.managerName} packages...`);
  yield* packages.installSelfIfMissing();
  yield* packages.applyManifest(packages.manifestPaths[0] ?? "");
  yield* Console.log("Building dot...");
  yield* commands.run(
    "bun",
    ["build", "./bin/dot.ts", "--compile", "--outfile", "./dist/dot"],
    { cwd: config.dotfilesDir }
  );
  yield* linker.linkDot("release");
  yield* Console.log("Installing shell integrations...");
  yield* shell.installIntegrations();
  const loginShellIsZsh =
    options.unattended || (yield* shell.ensureLoginShell());
  yield* Console.log("Applying dotfiles config...");
  yield* applyConfig();
  yield* installMiseIfMissing();
  yield* Console.log("Installing mise tools...");
  yield* commands.runInteractive("mise", ["install"], {
    cwd: config.homeDir,
  });
  if (options.unattended) {
    yield* Console.log("Skipping Git identity; rerun dot init once signed in");
  } else {
    yield* Console.log("Configuring Git identity...");
    yield* git.configureIdentity();
  }
  yield* Console.log("Installing Pi runtime...");
  yield* agent.installSelfIfMissing();
  yield* Console.log("Installing Pi package dependencies...");
  yield* agent.installPackageDeps(config.piPackageDir);
  yield* Console.log("Installing Pi extension dependencies...");
  yield* agent.installExtensionPackageDeps(config.piExtensionsDir);
  yield* doctor();
  yield* Console.log("Init complete");
  if (!loginShellIsZsh) {
    yield* Console.log(
      'Login shell is not zsh; run: sudo chsh -s "$(command -v zsh)" "$USER"'
    );
  } else if (!isZshPath(process.env.SHELL)) {
    yield* Console.log(
      "Login shell changed to zsh; run `exec zsh -l` or log in again to use it"
    );
  }
});
