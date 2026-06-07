import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import type * as Option from "effect/Option";

import { PiExtensionVendor } from "../services/PiExtensionVendor.ts";

export interface PiAddOptions {
  readonly ref: Option.Option<string>;
  readonly source: string;
}

export const piAdd = Effect.fn("piAdd")(function* (options: PiAddOptions) {
  const vendor = yield* PiExtensionVendor;
  const destination = yield* vendor.add(options);
  yield* Console.log(`Vendored Pi package into ${destination}`);
});
