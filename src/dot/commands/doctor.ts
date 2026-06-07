import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";

import { DotfilesConfig } from "../Config.ts";
import { CommandExecutor } from "../services/CommandExecutor/index.ts";
import { Secrets } from "../services/Secrets.ts";
import { Workspace } from "../services/Workspace.ts";

export const doctor = Effect.fn("doctor")(function* () {
  const config = yield* DotfilesConfig;
  const fs = yield* FileSystem.FileSystem;
  const commands = yield* CommandExecutor;
  const workspace = yield* Workspace;
  const secrets = yield* Secrets;

  yield* Console.log(`Dotfiles dir: ${config.dotfilesDir}`);
  yield* Console.log(
    line({
      label: "repo at ~/.dotfiles",
      ok: config.dotfilesDir === `${config.homeDir}/.dotfiles`,
    })
  );

  for (const cmd of [
    "git",
    "brew",
    "zsh",
    "stow",
    "op",
    "pi",
    "bun",
  ] as const) {
    yield* Console.log(line({ label: cmd, ok: yield* commands.exists(cmd) }));
  }

  yield* Console.log(
    line({
      detail: config.brewfilePath,
      label: "Brewfile",
      ok: yield* fs.exists(config.brewfilePath),
    })
  );
  const scan = yield* workspace.secretValueScan;
  if (scan.trim().length > 0) {
    yield* Console.log("! potential inline exported secrets found:");
    yield* Console.log(scan);
  } else {
    yield* Console.log("✓ no obvious inline exported secrets found");
  }

  for (const secretLine of yield* secrets.doctor()) {
    yield* Console.log(secretLine);
  }
});

const line = (input: {
  readonly detail?: string;
  readonly label: string;
  readonly ok: boolean;
}) =>
  `${input.ok ? "✓" : "!"} ${input.label}${input.detail ? `: ${input.detail}` : ""}`;
