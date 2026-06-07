import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import { DotfilesConfig } from "../Config.ts";
import { CommandExecutor } from "./CommandExecutor/index.ts";

export interface PiAddOptions {
  readonly ref: Option.Option<string>;
  readonly source: string;
}

export class PiExtensionVendor extends Context.Service<PiExtensionVendor>()(
  "dot/PiExtensionVendor",
  {
    make: Effect.gen(function* () {
      const command = yield* CommandExecutor;
      const config = yield* DotfilesConfig;
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;

      return {
        add: (options: PiAddOptions) =>
          Effect.gen(function* () {
            const repo = repository(options.source);
            const name = packageName(options.source);
            const destination = path.join(config.piVendorDir, name);
            const ref = Option.getOrUndefined(options.ref);

            yield* fs.remove(destination, { force: true, recursive: true });
            yield* fs.makeDirectory(path.dirname(destination), {
              recursive: true,
            });
            yield* command
              .run("git", ["clone", repo, destination])
              .pipe(Effect.asVoid);

            if (ref !== undefined) {
              yield* command
                .run("git", ["checkout", ref], { cwd: destination })
                .pipe(Effect.asVoid);
            }

            yield* cleanupVendoredPackage(fs, path, destination);
            yield* writeProvenance(fs, path, destination, options.source, ref);
            yield* addLocalPackageSource(
              fs,
              config.trackedPiSettingsPath,
              `../../../vendor/pi/${name}`
            );

            return destination;
          }),
      } as const;
    }),
  }
) {
  static readonly Live = Layer.effect(this, this.make);
}

const addLocalPackageSource = (
  fs: FileSystem.FileSystem,
  settingsPath: string,
  source: string
) =>
  Effect.gen(function* () {
    const settings = JSON.parse(yield* fs.readFileString(settingsPath)) as {
      packages?: unknown[];
      [key: string]: unknown;
    };
    const packages = Array.isArray(settings.packages) ? settings.packages : [];
    const exists = packages.some((entry) =>
      typeof entry === "string"
        ? entry === source
        : typeof entry === "object" &&
          entry !== null &&
          "source" in entry &&
          entry.source === source
    );

    if (!exists) {
      settings.packages = [...packages, source];
      yield* fs.writeFileString(
        settingsPath,
        `${JSON.stringify(settings, null, 2)}\n`
      );
    }
  });

const cleanupVendoredPackage = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  destination: string
) =>
  Effect.gen(function* () {
    for (const entry of [".git", "node_modules", ".turbo", ".next"] as const) {
      yield* fs.remove(path.join(destination, entry), {
        force: true,
        recursive: true,
      });
    }

    const entries = yield* fs.readDirectory(destination, { recursive: true });
    for (const entry of entries) {
      const basename = path.basename(entry);
      if (
        basename === ".DS_Store" ||
        basename === ".env" ||
        basename.endsWith(".local")
      ) {
        yield* fs.remove(path.join(destination, entry), { force: true });
      }
    }
  });

const packageName = (source: string) =>
  (
    source
      .replace(/^git:/u, "")
      .replace(/[@#].*$/u, "")
      .split(/[/:]/u)
      .at(-1) ?? "package"
  )
    .replace(/\.git$/u, "")
    .replaceAll(/[^0-9A-Za-z._-]+/gu, "-");

const repository = (source: string) => {
  const normalized = source.replace(/^git:/u, "");
  return /^[^/:]+\/[^/:]+$/u.test(normalized)
    ? `https://github.com/${normalized}.git`
    : normalized;
};

const writeProvenance = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  destination: string,
  source: string,
  ref: string | undefined
) =>
  fs.writeFileString(
    path.join(destination, "PROVENANCE.md"),
    [
      "# Provenance",
      "",
      `- Source: ${source}`,
      `- Ref: ${ref ?? "unpinned clone HEAD at import time"}`,
      `- Imported: ${new Date().toISOString()}`,
      "- Local changes: initial cleanup removed VCS metadata, dependency installs, local caches, and local environment files.",
      "",
    ].join("\n")
  );
