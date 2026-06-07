import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import { DotfilesConfig } from "../Config.ts";
import { CommandExecutor } from "../services/CommandExecutor/index.ts";

export interface EditOptions {
  readonly target: Option.Option<string>;
}

export const edit = Effect.fn("edit")(function* (options: EditOptions) {
  const command = yield* CommandExecutor;
  const config = yield* DotfilesConfig;
  const path = yield* Path.Path;
  const editor = parseEditorCommand(config.editorCommand);
  const target = Option.match(options.target, {
    onNone: () => config.dotfilesDir,
    onSome: (value) =>
      path.isAbsolute(value) ? value : path.join(config.dotfilesDir, value),
  });

  yield* Console.log(`Opening ${target}`);
  yield* command.runInteractive(editor.command, [...editor.args, target], {
    cwd: config.dotfilesDir,
  });
});

const parseEditorCommand = (value: string) => {
  const [command = "vi", ...args] = value.match(
    /(?:[^\s"']+|"[^"]*"|'[^']*')+/gu
  ) ?? ["vi"];
  return {
    args: args.map((arg) => arg.replace(/^(["'])(.*)\1$/u, "$2")),
    command: command.replace(/^(["'])(.*)\1$/u, "$2"),
  };
};
