import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as Prompt from "effect/unstable/cli/Prompt";

import { DotfilesConfig } from "../Config.ts";
import { ConfigLinker } from "../services/ConfigLinker/index.ts";
import { applyCursorProfile } from "./cursor.ts";

interface ApplyConfigOptions {
  readonly cursor?: boolean;
  readonly cursorExtensions?: boolean;
}

interface ApplyCliOptions {
  readonly cursor: boolean;
  readonly noCursorExtensions: boolean;
  readonly yes: boolean;
}

export const applyConfig = Effect.fn("applyConfig")(function* (
  options?: ApplyConfigOptions
) {
  const config = yield* DotfilesConfig;
  const linker = yield* ConfigLinker;

  yield* linker.linkHome(config.dotfilesDir, config.homeDir);

  yield* Console.log("Applied home/ config links into $HOME");

  if (options?.cursor) {
    yield* applyCursorProfile({ extensions: options.cursorExtensions ?? true });
  }
});

export const applyConfigFromCli = Effect.fn("applyConfigFromCli")(function* (
  options: ApplyCliOptions
) {
  if (options.cursor) {
    yield* applyConfig({
      cursor: true,
      cursorExtensions: !options.noCursorExtensions,
    });
    return;
  }

  if (options.yes) {
    yield* applyConfig();
    return;
  }

  const setupCursor = yield* Prompt.run(
    Prompt.confirm({
      initial: false,
      message: "Apply Cursor profile too?",
    })
  );

  yield* applyConfig({ cursor: setupCursor });
});

export const unapplyConfig = Effect.fn("unapplyConfig")(function* () {
  const config = yield* DotfilesConfig;
  const linker = yield* ConfigLinker;

  yield* linker.unlinkHome(config.dotfilesDir, config.homeDir);

  yield* Console.log("Removed home/ config links from $HOME");
});
