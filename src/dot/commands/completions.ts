import * as Console from "effect/Console";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { DotfilesConfig } from "../Config.ts";
import { applyConfig } from "./stow.ts";

const commandNamePattern = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u;

class CompletionCommandError extends Data.TaggedError(
  "CompletionCommandError"
)<{
  readonly name?: string;
  readonly reason: "empty-stdin" | "invalid-command-name";
}> {
  override get message(): string {
    if (this.reason === "invalid-command-name") {
      return `Completion name must look like a command name: ${this.name}`;
    }

    return "No completion content received on stdin";
  }
}

export const installCompletion = Effect.fn("installCompletion")(function* (
  name: string,
  options: { readonly apply: boolean; readonly shell: "zsh" }
) {
  if (!commandNamePattern.test(name)) {
    return yield* new CompletionCommandError({
      name,
      reason: "invalid-command-name",
    });
  }

  const config = yield* DotfilesConfig;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const completionsDir = path.join(
    config.dotfilesDir,
    "home",
    ".config",
    "zsh",
    "completions"
  );
  const completionPath = path.join(completionsDir, `_${name}`);
  const content = yield* Effect.promise(() => Bun.stdin.text());
  const normalized = content.endsWith("\n") ? content : `${content}\n`;

  if (content.trim().length === 0) {
    return yield* new CompletionCommandError({ reason: "empty-stdin" });
  }

  yield* fs.makeDirectory(completionsDir, { recursive: true });
  yield* fs.writeFileString(completionPath, normalized);

  yield* Console.log(
    `Installed ${options.shell} completions: ${completionPath}`
  );

  if (options.apply) {
    yield* applyConfig();
  }
});
