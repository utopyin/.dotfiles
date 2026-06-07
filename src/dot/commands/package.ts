import * as Console from "effect/Console";
import * as Effect from "effect/Effect";

import { DotfilesConfig } from "../Config.ts";
import { PackageInstaller } from "../services/PackageInstaller/index.ts";

export const packageList = Effect.fn("packageList")(function* () {
  const config = yield* DotfilesConfig;
  const installer = yield* PackageInstaller;
  const manifest = yield* installer.listManifest(config.brewfilePath);
  yield* Console.log(manifest);
});
