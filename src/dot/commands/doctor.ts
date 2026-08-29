import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";

import { DotfilesConfig } from "../Config.ts";
import { CommandExecutor } from "../services/CommandExecutor/index.ts";
import { GitSetup } from "../services/GitSetup.ts";
import { PackageInstaller } from "../services/PackageInstaller/index.ts";
import { Secrets } from "../services/Secrets.ts";
import { Workspace } from "../services/Workspace.ts";

export const doctor = Effect.fn("doctor")(function* () {
  const config = yield* DotfilesConfig;
  const fs = yield* FileSystem.FileSystem;
  const commands = yield* CommandExecutor;
  const git = yield* GitSetup;
  const workspace = yield* Workspace;
  const packages = yield* PackageInstaller;
  const secrets = yield* Secrets;

  yield* Console.log(`Dotfiles dir: ${config.dotfilesDir}`);
  yield* Console.log(
    line({
      detail: config.dotfilesDir,
      label: "dotfiles repository",
      ok: yield* fs.exists(`${config.dotfilesDir}/package.json`),
    })
  );

  for (const cmd of ["git", "gh", "zsh", "stow", "op", "pi", "bun"] as const) {
    yield* Console.log(line({ label: cmd, ok: yield* commands.exists(cmd) }));
  }
  yield* Console.log(
    line({
      label: "open-computer-use",
      ok: yield* miseToolInstalled("open-computer-use").pipe(
        Effect.provideService(CommandExecutor, commands)
      ),
    })
  );

  const gitStatus = yield* git.status();
  yield* Console.log(
    line({ label: "Git user name", ok: gitStatus.nameConfigured })
  );
  yield* Console.log(
    line({ label: "Git user email", ok: gitStatus.emailConfigured })
  );
  yield* Console.log(
    line({
      label: "GitHub CLI authentication",
      ok: gitStatus.githubAuthenticated,
    })
  );
  yield* Console.log(
    line({
      label: "GitHub HTTPS credential helper",
      ok: gitStatus.githubCredentialHelperConfigured,
    })
  );
  yield* Console.log(
    line({
      label: "Git automatic upstream setup",
      ok: gitStatus.autoSetupRemoteConfigured,
    })
  );
  yield* Console.log(
    line({ label: "Git SSH signing", ok: gitStatus.signingConfigured })
  );
  yield* Console.log(
    line({
      label: "Git SSH signing key available",
      ok: gitStatus.signingKeyAvailable,
    })
  );

  yield* Console.log(`Package manager: ${packages.managerName}`);
  for (const manifestPath of packages.manifestPaths) {
    yield* Console.log(
      line({
        detail: manifestPath,
        label: "package manifest",
        ok: yield* fs.exists(manifestPath),
      })
    );
  }
  yield* Console.log(
    line({
      label: `${packages.managerName} packages installed`,
      ok: yield* packages.checkManifest(packages.manifestPaths[0] ?? ""),
    })
  );
  const dotLauncher = yield* currentDotLauncher(config.localBinDotPath).pipe(
    Effect.provideService(FileSystem.FileSystem, fs)
  );
  yield* Console.log(
    line({
      detail: dotLauncher.detail,
      label: "dot launcher",
      ok: dotLauncher.ok,
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
  const dependencyAudit = yield* workspace.dependencyAudit;
  yield* Console.log(
    line({
      ...(dependencyAudit.detail === undefined
        ? {}
        : { detail: dependencyAudit.detail }),
      label: "dependency audit",
      ok: dependencyAudit.ok,
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

const currentDotLauncher = Effect.fn("doctor.currentDotLauncher")(function* (
  launcherPath: string
) {
  const fs = yield* FileSystem.FileSystem;
  const linkTarget = yield* fs.readLink(launcherPath).pipe(
    Effect.option,
    Effect.map((target) => (target._tag === "Some" ? target.value : undefined))
  );
  if (linkTarget !== undefined) {
    return {
      detail: linkTarget,
      ok: linkTarget.endsWith("/dist/dot"),
    };
  }

  const contents = yield* fs.readFileString(launcherPath).pipe(Effect.option);
  if (contents._tag === "Some" && contents.value.includes("/bin/dot.ts")) {
    return { detail: "development shim", ok: true };
  }

  return { detail: "missing or unmanaged", ok: false };
});

const miseToolInstalled = Effect.fn("doctor.miseToolInstalled")(function* (
  tool: string
) {
  const commands = yield* CommandExecutor;
  return yield* commands.run("mise", ["which", tool]).pipe(
    Effect.as(true),
    Effect.catchCause(() => Effect.succeed(false))
  );
});

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
