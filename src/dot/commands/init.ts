import * as Console from "effect/Console";
import * as Effect from "effect/Effect";

import { DotfilesConfig } from "../Config.ts";
import { AgentRuntime } from "../services/AgentRuntime/index.ts";
import { PackageInstaller } from "../services/PackageInstaller/index.ts";
import { ShellSetup } from "../services/ShellSetup/index.ts";
import { doctor } from "./doctor.ts";
import { applyConfig } from "./stow.ts";

export const init = Effect.fn("init")(function* () {
  const config = yield* DotfilesConfig;
  const agent = yield* AgentRuntime;
  const packages = yield* PackageInstaller;
  const shell = yield* ShellSetup;
  yield* packages.installSelfIfMissing();
  yield* packages.applyManifest(config.brewfilePath);
  yield* shell.installIntegrations();
  yield* applyConfig();
  yield* agent.installSelfIfMissing();
  yield* agent.installPackageDeps(config.piPackageDir);
  for (const packageDir of config.piExtensionPackageDirs) {
    yield* agent.installPackageDeps(packageDir);
  }
  yield* doctor();
  yield* Console.log("Init complete");
});
