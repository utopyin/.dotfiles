import * as Console from "effect/Console";
import * as Effect from "effect/Effect";

import { DotfilesConfig } from "../Config.ts";
import { PackageInstaller } from "../services/PackageInstaller/index.ts";
import { doctor } from "./doctor.ts";
import { applyConfig } from "./stow.ts";

export const init = Effect.fn("init")(function* () {
  const config = yield* DotfilesConfig;
  const packages = yield* PackageInstaller;
  yield* packages.installSelfIfMissing();
  yield* packages.applyManifest(config.brewfilePath);
  yield* applyConfig();
  yield* doctor();
  yield* Console.log("Init complete");
});
