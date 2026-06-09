import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";

import { DotfilesConfig } from "../Config.ts";
import { CommandExecutor } from "../services/CommandExecutor/index.ts";
import { PackageInstaller } from "../services/PackageInstaller/index.ts";
import { Secrets } from "../services/Secrets.ts";
import { Workspace } from "../services/Workspace.ts";

export const doctor = Effect.fn("doctor")(function* () {
  const config = yield* DotfilesConfig;
  const fs = yield* FileSystem.FileSystem;
  const commands = yield* CommandExecutor;
  const workspace = yield* Workspace;
  const packages = yield* PackageInstaller;
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
  yield* Console.log(
    line({
      label: "Brewfile packages installed",
      ok: yield* packages.checkManifest(config.brewfilePath),
    })
  );
  const dotLinkTarget = yield* currentDotLinkTarget(
    config.localBinDotPath
  ).pipe(Effect.provideService(FileSystem.FileSystem, fs));
  yield* Console.log(
    line({
      detail: dotLinkTarget,
      label: "dot symlink",
      ok: dotLinkTarget === `${config.dotfilesDir}/dist/dot`,
    })
  );
  yield* Console.log(
    line({
      label: "shell config exists",
      ok: yield* fs.exists(config.shellConfigPath),
    })
  );
  yield* Console.log(
    line({
      label: "prompt config exists",
      ok: yield* fs.exists(config.promptConfigPath),
    })
  );
  yield* Console.log(
    line({
      label: "zsh syntax",
      ok: yield* zshSyntaxOk([
        config.shellConfigPath,
        config.promptConfigPath,
      ]).pipe(Effect.provideService(CommandExecutor, commands)),
    })
  );
  yield* Console.log(
    line({
      label: "Pi settings",
      ok: yield* fs.exists(config.piSettingsPath),
    })
  );
  yield* Console.log(
    line({
      label: "Pi MCP config",
      ok: yield* fs.exists(config.piMcpConfigPath),
    })
  );
  yield* Console.log(
    line({
      label: "dependency audit",
      ok: yield* workspace.dependencyAudit,
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

const currentDotLinkTarget = Effect.fn("doctor.currentDotLinkTarget")(
  function* (linkPath: string) {
    const fs = yield* FileSystem.FileSystem;
    return yield* fs
      .readLink(linkPath)
      .pipe(Effect.catchCause(() => Effect.succeed("missing")));
  }
);

const zshSyntaxOk = Effect.fn("doctor.zshSyntaxOk")(function* (
  files: readonly string[]
) {
  const commands = yield* CommandExecutor;
  const results = yield* Effect.all(
    files.map((file) =>
      commands.run("zsh", ["-n", file]).pipe(
        Effect.as(true),
        Effect.catchCause(() => Effect.succeed(false))
      )
    )
  );
  return results.every(Boolean);
});

const line = (input: {
  readonly detail?: string;
  readonly label: string;
  readonly ok: boolean;
}) =>
  `${input.ok ? "✓" : "!"} ${input.label}${input.detail ? `: ${input.detail}` : ""}`;
