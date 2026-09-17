import * as Console from "effect/Console";
import * as Effect from "effect/Effect";

import { DotfilesConfig } from "../Config.ts";
import { AgentRuntime } from "../services/AgentRuntime/index.ts";
import { BinaryLinker } from "../services/BinaryLinker.ts";
import { CommandExecutor } from "../services/CommandExecutor/index.ts";
import { GitSetup } from "../services/GitSetup.ts";
import { PackageInstaller } from "../services/PackageInstaller/index.ts";
import { ShellSetup } from "../services/ShellSetup/index.ts";
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

export const init = Effect.fn("init")(function* () {
  const config = yield* DotfilesConfig;
  const agent = yield* AgentRuntime;
  const commands = yield* CommandExecutor;
  const linker = yield* BinaryLinker;
  const git = yield* GitSetup;
  const packages = yield* PackageInstaller;
  const shell = yield* ShellSetup;
  yield* packages.installSelfIfMissing();
  yield* packages.applyManifest(packages.manifestPaths[0] ?? "");
  yield* commands.run(
    "bun",
    ["build", "./bin/dot.ts", "--compile", "--outfile", "./dist/dot"],
    { cwd: config.dotfilesDir }
  );
  yield* linker.linkDot("release");
  yield* shell.installIntegrations();
  yield* applyConfig();
  yield* installMiseIfMissing();
  yield* commands.runInteractive("mise", ["install"], {
    cwd: config.homeDir,
  });
  yield* git.configureIdentity();
  yield* agent.installSelfIfMissing();
  yield* agent.installPackageDeps(config.piPackageDir);
  yield* agent.installExtensionPackageDeps(config.piExtensionsDir);
  yield* doctor();
  yield* Console.log("Init complete");
});
