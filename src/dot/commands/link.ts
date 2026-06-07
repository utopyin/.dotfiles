import * as Console from "effect/Console";
import * as Effect from "effect/Effect";

import { BinaryLinker } from "../services/BinaryLinker.ts";

export const link = Effect.fn("link")(function* () {
  const linker = yield* BinaryLinker;
  yield* linker.linkDot;
  yield* Console.log("Linked dot into ~/.local/bin/dot");
});

export const unlink = Effect.fn("unlink")(function* () {
  const linker = yield* BinaryLinker;
  yield* linker.unlinkDot;
  yield* Console.log("Unlinked ~/.local/bin/dot");
});
