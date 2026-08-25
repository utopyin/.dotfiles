import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";

import { DotfilesConfig } from "../../Config.ts";
import { CommandExecutor } from "../CommandExecutor/index.ts";
import { PackageInstallerConfigurationError } from "./errors.ts";
import type { PackageEntry, PackageInstallerShape } from "./index.ts";

export const makeOmarchyPackageInstaller = Effect.fn(
  "OmarchyPackageInstaller.make"
)(function* () {
  const command = yield* CommandExecutor;
  const config = yield* DotfilesConfig;
  const fs = yield* FileSystem.FileSystem;
  const desiredManifests = [
    config.archRepoManifestPath,
    config.archAurManifestPath,
  ];
  const manifests = [...desiredManifests, config.archRemoveManifestPath];

  // Native package APIs intentionally share a stable service key order.
  // oxlint-disable-next-line sort-keys
  return {
    managerName: "Omarchy",
    manifestPaths: manifests,
    addToManifest: Effect.fn("OmarchyPackageInstaller.addToManifest")(
      function* (_manifestPath: string, entry: PackageEntry) {
        const manifestPath = manifestFor(entry.kind, config);
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
      }
    ),
    applyManifest: Effect.fn("OmarchyPackageInstaller.applyManifest")(
      function* () {
        yield* removeManifest(config.archRemoveManifestPath).pipe(
          Effect.provideService(CommandExecutor, command),
          Effect.provideService(FileSystem.FileSystem, fs)
        );
        yield* installManifest(config.archRepoManifestPath, "repo").pipe(
          Effect.provideService(CommandExecutor, command),
          Effect.provideService(FileSystem.FileSystem, fs)
        );
        yield* installManifest(config.archAurManifestPath, "aur").pipe(
          Effect.provideService(CommandExecutor, command),
          Effect.provideService(FileSystem.FileSystem, fs)
        );
      }
    ),
    checkManifest: Effect.fn("OmarchyPackageInstaller.checkManifest")(
      function* () {
        const packages = yield* readPackages(desiredManifests).pipe(
          Effect.provideService(FileSystem.FileSystem, fs)
        );
        if (packages.length === 0) {
          return true;
        }
        return yield* command.run("pacman", ["-Q", ...packages]).pipe(
          Effect.as(true),
          Effect.catchCause(() => Effect.succeed(false))
        );
      }
    ),
    installSelfIfMissing: Effect.fn(
      "OmarchyPackageInstaller.installSelfIfMissing"
    )(function* () {
      const exists = yield* command.exists("omarchy");
      if (!exists) {
        yield* command.run("omarchy", ["--help"]).pipe(Effect.asVoid);
      }
    }),
    isInstalled: Effect.fn("OmarchyPackageInstaller.isInstalled")(function* () {
      return yield* command.exists("omarchy");
    }),
    listManifest: Effect.fn("OmarchyPackageInstaller.listManifest")(
      function* () {
        const repo = yield* readManifest(config.archRepoManifestPath).pipe(
          Effect.provideService(FileSystem.FileSystem, fs)
        );
        const aur = yield* readManifest(config.archAurManifestPath).pipe(
          Effect.provideService(FileSystem.FileSystem, fs)
        );
        const remove = yield* readManifest(config.archRemoveManifestPath).pipe(
          Effect.provideService(FileSystem.FileSystem, fs)
        );
        return [
          `# repo`,
          repo.trim(),
          `# aur`,
          aur.trim(),
          `# remove`,
          remove.trim(),
        ]
          .filter(Boolean)
          .join("\n");
      }
    ),
    removeFromManifest: Effect.fn("OmarchyPackageInstaller.removeFromManifest")(
      function* (_manifestPath: string, entry: Omit<PackageEntry, "id">) {
        const manifestPath = manifestFor(entry.kind, config);
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
    updateAll: Effect.fn("OmarchyPackageInstaller.updateAll")(function* () {
      yield* command.runInteractive("omarchy", ["update"]);
    }),
  } satisfies PackageInstallerShape;
});

const manifestFor = (
  kind: PackageEntry["kind"],
  config: {
    readonly archAurManifestPath: string;
    readonly archRepoManifestPath: string;
  }
) => {
  if (kind === "aur") {
    return config.archAurManifestPath;
  }
  if (kind === "repo" || kind === "brew") {
    return config.archRepoManifestPath;
  }
  return config.archAurManifestPath;
};

const installManifest = Effect.fn("OmarchyPackageInstaller.installManifest")(
  function* (manifestPath: string, source: InstallSource) {
    const command = yield* CommandExecutor;
    const fs = yield* FileSystem.FileSystem;
    const desired = yield* readPackages([manifestPath]).pipe(
      Effect.provideService(FileSystem.FileSystem, fs)
    );
    const packages = yield* missingPackages(desired).pipe(
      Effect.provideService(CommandExecutor, command)
    );
    if (packages.length > 0) {
      const invocation = resolveInstallCommand(
        source,
        process.stdin.isTTY === true
      );
      if (invocation.requiresPolicyKit && !(yield* command.exists("pkexec"))) {
        return yield* new PackageInstallerConfigurationError({
          detail:
            "pkexec is required when no interactive terminal is available",
          manager: "Omarchy",
        });
      }
      yield* runPackageInstall(invocation, packages).pipe(
        Effect.provideService(CommandExecutor, command)
      );
    }
  }
);

type InstallSource = "aur" | "repo";

const removeManifest = Effect.fn("OmarchyPackageInstaller.removeManifest")(
  function* (manifestPath: string) {
    const command = yield* CommandExecutor;
    const fs = yield* FileSystem.FileSystem;
    const unwanted = yield* readPackages([manifestPath]).pipe(
      Effect.provideService(FileSystem.FileSystem, fs)
    );
    const packages = yield* installedPackages(unwanted).pipe(
      Effect.provideService(CommandExecutor, command)
    );
    if (packages.length > 0) {
      const invocation = resolveRemoveCommand(process.stdin.isTTY === true);
      if (invocation.requiresPolicyKit && !(yield* command.exists("pkexec"))) {
        return yield* new PackageInstallerConfigurationError({
          detail:
            "pkexec is required to remove conflicting packages without an interactive terminal",
          manager: "Omarchy",
        });
      }
      yield* command.runInteractive(invocation.command, [
        ...invocation.args,
        ...packages,
      ]);
    }
  }
);

export const resolveRemoveCommand = (hasTerminal: boolean) =>
  hasTerminal
    ? {
        args: ["pkg", "drop"] as const,
        command: "omarchy",
        requiresPolicyKit: false,
      }
    : {
        args: ["omarchy", "pkg", "drop"] as const,
        command: "pkexec",
        requiresPolicyKit: true,
      };

export const resolveInstallCommand = (
  source: InstallSource,
  hasTerminal: boolean
) => {
  if (source === "repo") {
    return hasTerminal
      ? {
          args: ["pkg", "add"] as const,
          command: "omarchy",
          requiresPolicyKit: false,
        }
      : {
          args: ["omarchy", "pkg", "add"] as const,
          command: "pkexec",
          requiresPolicyKit: true,
        };
  }
  return hasTerminal
    ? {
        args: ["pkg", "aur", "add"] as const,
        command: "omarchy",
        requiresPolicyKit: false,
      }
    : {
        args: [
          "--sudo",
          "pkexec",
          "--noconfirm",
          "--needed",
          "--answerclean",
          "None",
          "--answerdiff",
          "None",
          "-S",
        ] as const,
        command: "yay",
        requiresPolicyKit: true,
      };
};

const missingPackages = Effect.fn("OmarchyPackageInstaller.missingPackages")(
  function* (packages: readonly string[]) {
    const installed = yield* installedPackageNames();
    return packages.filter((name) => !installed.has(name));
  }
);

const installedPackages = Effect.fn(
  "OmarchyPackageInstaller.installedPackages"
)(function* (packages: readonly string[]) {
  const installed = yield* installedPackageNames();
  return packages.filter((name) => installed.has(name));
});

const installedPackageNames = Effect.fn(
  "OmarchyPackageInstaller.installedPackageNames"
)(function* () {
  const command = yield* CommandExecutor;
  const output = yield* command.runText("pacman", ["-Qq"]);
  return new Set(output.split("\n").filter(Boolean));
});

interface PackageInvocation {
  readonly args: readonly string[];
  readonly command: string;
  readonly requiresPolicyKit: boolean;
}

const runPackageInstall = Effect.fn(
  "OmarchyPackageInstaller.runPackageInstall"
)(function* (invocation: PackageInvocation, packages: readonly string[]) {
  const command = yield* CommandExecutor;
  const attempted = yield* Effect.exit(
    command.runInteractive(invocation.command, [
      ...invocation.args,
      ...packages,
    ])
  );
  if (Exit.isSuccess(attempted)) {
    return;
  }
  const remaining = yield* missingPackages(packages).pipe(
    Effect.provideService(CommandExecutor, command)
  );
  if (remaining.length === 0) {
    return;
  }
  return yield* attempted;
});

const readPackages = Effect.fn("OmarchyPackageInstaller.readPackages")(
  function* (manifestPaths: readonly string[]) {
    const fs = yield* FileSystem.FileSystem;
    const contents = yield* Effect.all(
      manifestPaths.map((path) =>
        readManifest(path).pipe(
          Effect.provideService(FileSystem.FileSystem, fs)
        )
      )
    );
    return contents.flatMap((content) =>
      content
        .split("\n")
        .map((line) => line.replace(/#.*/u, "").trim())
        .filter(Boolean)
    );
  }
);

const readManifest = Effect.fn("OmarchyPackageInstaller.readManifest")(
  function* (manifestPath: string) {
    const fs = yield* FileSystem.FileSystem;
    return (yield* fs.exists(manifestPath))
      ? yield* fs.readFileString(manifestPath)
      : "";
  }
);

const appendPackage = (content: string, name: string) =>
  content.trim() ? `${content.trimEnd()}\n${name}\n` : `${name}\n`;
