import * as Console from "effect/Console";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";

import type { DotLinkMode } from "../services/BinaryLinker.ts";
import { BinaryLinker } from "../services/BinaryLinker.ts";

export interface LinkOptions {
  readonly dev?: boolean;
  readonly release?: boolean;
}

class LinkCommandError extends Data.TaggedError("LinkCommandError")<{
  readonly reason: "conflicting-modes";
}> {
  override get message(): string {
    return this.reason === "conflicting-modes"
      ? "Pass only one of --dev or --release"
      : this.reason;
  }
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

const resolveLinkMode = Effect.fn("link.resolveLinkMode")(function* (
  options?: LinkOptions
) {
  if (options?.dev && options.release) {
    return yield* new LinkCommandError({ reason: "conflicting-modes" });
  }

  const mode: DotLinkMode = options?.dev ? "dev" : "release";
  return mode;
});
