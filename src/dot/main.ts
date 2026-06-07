import { BunRuntime } from "@effect/platform-bun";
import * as Effect from "effect/Effect";

import { runCli } from "./Cli.ts";
import { Live } from "./Runtime.ts";

export const main = () => {
  runCli.pipe(Effect.provide(Live), BunRuntime.runMain);
};
