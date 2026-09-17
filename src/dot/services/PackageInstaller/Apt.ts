import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";

import { DotfilesConfig } from "../../Config.ts";
import { CommandExecutor } from "../CommandExecutor/index.ts";
import { PackageInstallerConfigurationError } from "./errors.ts";
import type { PackageEntry, PackageInstallerShape } from "./index.ts";

export const makeAptPackageInstaller = Effect.fn("AptPackageInstaller.make")(
  function* () {
    const command = yield* CommandExecutor;
    const config = yield* DotfilesConfig;
    const fs = yield* FileSystem.FileSystem;
    const manifestPath = config.aptManifestPath;

    // Native package APIs intentionally share a stable service key order.
    // oxlint-disable-next-line sort-keys
    return {
      managerName: "APT",
      manifestPaths: [manifestPath],
      addToManifest: Effect.fn("AptPackageInstaller.addToManifest")(function* (
        _manifestPath: string,
        entry: PackageEntry
      ) {
        const content = yield* readManifest(manifestPath).pipe(
          Effect.provideService(FileSystem.FileSystem, fs)
        );
        if (content.split("\n").includes(entry.name)) {
          return;
        }
        yield* fs.writeFileString(
          manifestPath,
          appendPackage(content, entry.name)
        );
      }),
      applyManifest: Effect.fn("AptPackageInstaller.applyManifest")(
        function* () {
          const desired = yield* readPackages(manifestPath).pipe(
            Effect.provideService(FileSystem.FileSystem, fs)
          );
          const packages = yield* missingPackages(desired).pipe(
            Effect.provideService(CommandExecutor, command)
          );
          if (packages.length === 0) {
            return;
          }
          yield* runAptGet(["update"]).pipe(
            Effect.provideService(CommandExecutor, command)
          );
          yield* runAptGet(["install", "--yes", ...packages]).pipe(
            Effect.provideService(CommandExecutor, command)
          );
        }
      ),
      checkManifest: Effect.fn("AptPackageInstaller.checkManifest")(
        function* () {
          const desired = yield* readPackages(manifestPath).pipe(
            Effect.provideService(FileSystem.FileSystem, fs)
          );
          return yield* missingPackages(desired).pipe(
            Effect.provideService(CommandExecutor, command),
            Effect.map((missing) => missing.length === 0),
            Effect.catchCause(() => Effect.succeed(false))
          );
        }
      ),
      installSelfIfMissing: Effect.fn(
        "AptPackageInstaller.installSelfIfMissing"
      )(function* () {
        const exists = yield* command.exists("apt-get");
        if (!exists) {
          yield* command.run("apt-get", ["--version"]).pipe(Effect.asVoid);
        }
      }),
      isInstalled: Effect.fn("AptPackageInstaller.isInstalled")(function* () {
        return yield* command.exists("apt-get");
      }),
      listManifest: Effect.fn("AptPackageInstaller.listManifest")(function* () {
        const content = yield* readManifest(manifestPath).pipe(
          Effect.provideService(FileSystem.FileSystem, fs)
        );
        return content.trim();
      }),
      removeFromManifest: Effect.fn("AptPackageInstaller.removeFromManifest")(
        function* (_manifestPath: string, entry: Omit<PackageEntry, "id">) {
          const content = yield* readManifest(manifestPath).pipe(
            Effect.provideService(FileSystem.FileSystem, fs)
          );
          const next = content
            .split("\n")
            .filter((line) => line.trim() !== entry.name)
            .join("\n")
            .trim();
          yield* fs.writeFileString(manifestPath, next ? `${next}\n` : "");
        }
      ),
      updateAll: Effect.fn("AptPackageInstaller.updateAll")(function* () {
        yield* runAptGet(["update"]).pipe(
          Effect.provideService(CommandExecutor, command)
        );
        yield* runAptGet(["upgrade", "--yes"]).pipe(
          Effect.provideService(CommandExecutor, command)
        );
      }),
    } satisfies PackageInstallerShape;
  }
);

const runAptGet = Effect.fn("AptPackageInstaller.runAptGet")(function* (
  args: readonly string[]
) {
  const command = yield* CommandExecutor;
  const invocation = resolveAptGetCommand({
    hasTerminal: process.stdin.isTTY === true,
    isRoot: process.getuid?.() === 0,
  });
  if (invocation.requiresPolicyKit && !(yield* command.exists("pkexec"))) {
    return yield* new PackageInstallerConfigurationError({
      detail: "pkexec is required when no interactive terminal is available",
      manager: "APT",
    });
  }
  yield* command.runInteractive(invocation.command, [
    ...invocation.args,
    ...args,
  ]);
});

export const resolveAptGetCommand = (options: {
  readonly hasTerminal: boolean;
  readonly isRoot: boolean;
}) => {
  if (options.isRoot) {
    return { args: [] as const, command: "apt-get", requiresPolicyKit: false };
  }
  return options.hasTerminal
    ? {
        args: ["apt-get"] as const,
        command: "sudo",
        requiresPolicyKit: false,
      }
    : {
        args: ["apt-get"] as const,
        command: "pkexec",
        requiresPolicyKit: true,
      };
};

const missingPackages = Effect.fn("AptPackageInstaller.missingPackages")(
  function* (packages: readonly string[]) {
    if (packages.length === 0) {
      return [];
    }
    const command = yield* CommandExecutor;
    const output = yield* command.runText("dpkg-query", [
      "--show",
      "--showformat",
      // oxlint-disable-next-line no-template-curly-in-string
      "${Package} ${db:Status-Status}\n",
    ]);
    const installed = parseInstalledPackages(output);
    return packages.filter((name) => !installed.has(name));
  }
);

export const parseInstalledPackages = (output: string): ReadonlySet<string> =>
  new Set(
    output
      .split("\n")
      .map((line) => line.trim().split(" "))
      .filter(([, status]) => status === "installed")
      .flatMap(([name]) => (name ? [name] : []))
  );

const readPackages = Effect.fn("AptPackageInstaller.readPackages")(function* (
  manifestPath: string
) {
  const content = yield* readManifest(manifestPath);
  return content
    .split("\n")
    .map((line) => line.replace(/#.*/u, "").trim())
    .filter(Boolean);
});

const readManifest = Effect.fn("AptPackageInstaller.readManifest")(function* (
  manifestPath: string
) {
  const fs = yield* FileSystem.FileSystem;
  return (yield* fs.exists(manifestPath))
    ? yield* fs.readFileString(manifestPath)
    : "";
});

const appendPackage = (content: string, name: string) =>
  content.trim() ? `${content.trimEnd()}\n${name}\n` : `${name}\n`;
