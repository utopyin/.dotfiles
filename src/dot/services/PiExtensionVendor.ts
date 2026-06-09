import * as Context from "effect/Context";
import * as Data from "effect/Data";
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
        add: Effect.fn("PiExtensionVendor.add")(function* (
          options: PiAddOptions
        ) {
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

          yield* cleanupVendoredPackage(destination).pipe(
            Effect.provideService(FileSystem.FileSystem, fs),
            Effect.provideService(Path.Path, path)
          );
          yield* writeProvenance(destination, options.source, ref).pipe(
            Effect.provideService(FileSystem.FileSystem, fs),
            Effect.provideService(Path.Path, path)
          );
          yield* addLocalPackageSource(
            config.trackedPiSettingsPath,
            `../../../vendor/pi/${name}`
          ).pipe(Effect.provideService(FileSystem.FileSystem, fs));

          return destination;
        }),
      } as const;
    }),
  }
) {
  static readonly Live = Layer.effect(this, this.make);
}

class PiSettingsParseError extends Data.TaggedError("PiSettingsParseError")<{
  readonly cause: unknown;
  readonly settingsPath: string;
}> {
  override get message(): string {
    return `Failed to parse Pi settings at ${this.settingsPath}: ${formatUnknown(this.cause)}`;
  }
}

const addLocalPackageSource = Effect.fn(
  "PiExtensionVendor.addLocalPackageSource"
)(function* (settingsPath: string, source: string) {
  const fs = yield* FileSystem.FileSystem;
  const settings = yield* parsePiSettings(
    settingsPath,
    yield* fs.readFileString(settingsPath)
  );
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

const parsePiSettings = Effect.fn("PiExtensionVendor.parsePiSettings")(
  function* (settingsPath: string, content: string) {
    return yield* Effect.try({
      catch: (cause) => new PiSettingsParseError({ cause, settingsPath }),
      try: () =>
        JSON.parse(content) as {
          packages?: unknown[];
          [key: string]: unknown;
        },
    });
  }
);

const formatUnknown = (value: unknown) =>
  value instanceof Error ? value.message : String(value);

const cleanupVendoredPackage = Effect.fn(
  "PiExtensionVendor.cleanupVendoredPackage"
)(function* (destination: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
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

const writeProvenance = Effect.fn("PiExtensionVendor.writeProvenance")(
  function* (destination: string, source: string, ref: string | undefined) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* fs.writeFileString(
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
  }
);
