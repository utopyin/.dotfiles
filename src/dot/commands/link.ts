import * as Console from "effect/Console";
import * as Effect from "effect/Effect";

import type { DotLinkMode } from "../services/BinaryLinker.ts";
import { BinaryLinker } from "../services/BinaryLinker.ts";

export interface LinkOptions {
  readonly dev?: boolean;
  readonly release?: boolean;
}

export const link = Effect.fn("link")(function* (options?: LinkOptions) {
  const linker = yield* BinaryLinker;
  const mode = yield* resolveLinkMode(options);
  yield* linker.linkDot(mode);
  yield* Console.log(
    mode === "dev"
      ? "Linked dot into ~/.local/bin/dot (dev shim)"
      : "Linked dot into ~/.local/bin/dot (release binary)"
  );
});

export const unlink = Effect.fn("unlink")(function* () {
  const linker = yield* BinaryLinker;
  yield* linker.unlinkDot;
  yield* Console.log("Unlinked ~/.local/bin/dot");
});

const resolveLinkMode = (options?: LinkOptions) =>
  Effect.gen(function* () {
    if (options?.dev && options.release) {
      return yield* Effect.fail(
        new Error("Pass only one of --dev or --release")
      );
    }

    const mode: DotLinkMode = options?.dev ? "dev" : "release";
    return mode;
  });
