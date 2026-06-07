import { env, platform } from "node:process";

import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import { DotfilesConfig } from "../Config.ts";
import { CommandExecutor } from "../services/CommandExecutor/index.ts";

const CURSOR_PROFILE_FILE = "cursor-profile.code-profile";

const CursorExtensionSchema = Schema.Struct({
  displayName: Schema.optionalKey(Schema.String),
  identifier: Schema.optionalKey(
    Schema.Struct({ id: Schema.optionalKey(Schema.String) })
  ),
  preRelease: Schema.optionalKey(Schema.Boolean),
});

const CursorProfileSchema = Schema.Struct({
  extensions: Schema.optionalKey(Schema.String),
  keybindings: Schema.optionalKey(Schema.String),
  name: Schema.optionalKey(Schema.String),
  settings: Schema.optionalKey(Schema.String),
});

const CursorSettingsExportSchema = Schema.Struct({
  settings: Schema.optionalKey(Schema.String),
});

const CursorKeybindingsExportSchema = Schema.Struct({
  keybindings: Schema.optionalKey(Schema.String),
});

const CursorExtensionsExportSchema = Schema.Array(CursorExtensionSchema);

type CursorExtension = typeof CursorExtensionSchema.Type;
type CursorProfile = typeof CursorProfileSchema.Type;

export const applyCursorProfile = Effect.fn("applyCursorProfile")(
  function* (options?: { readonly extensions: boolean }) {
    const config = yield* DotfilesConfig;
    const command = yield* CommandExecutor;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const cursorPaths = resolveCursorPaths(
      config.dotfilesDir,
      config.homeDir,
      path
    );

    const profile = yield* Schema.decodeUnknownEffect(
      Schema.fromJsonString(CursorProfileSchema)
    )(yield* fs.readFileString(cursorPaths.profile));

    yield* fs.makeDirectory(cursorPaths.userDir, { recursive: true });

    const settingsText = yield* extractSettingsText(profile);
    if (settingsText) {
      yield* fs.writeFileString(
        cursorPaths.settings,
        `${settingsText.trimEnd()}\n`
      );
      yield* Console.log("Updated Cursor settings.json");
    }

    const keybindingsText = yield* extractKeybindingsText(profile);
    if (keybindingsText) {
      yield* fs.writeFileString(
        cursorPaths.keybindings,
        `${keybindingsText.replace("defaultsauto[]\n[", "defaults\n[").trimEnd()}\n`
      );
      yield* Console.log("Updated Cursor keybindings.json");
    }

    if (options?.extensions === false) {
      yield* Console.log("Skipped Cursor extension install");
      return;
    }

    if (!(yield* command.exists("cursor"))) {
      yield* Console.log("Skipped Cursor extensions: cursor CLI not found");
      return;
    }

    const extensionIds = yield* extractExtensionIds(profile);
    yield* Effect.all(
      extensionIds.map((extensionId) =>
        command
          .run("cursor", ["--install-extension", extensionId])
          .pipe(
            Effect.catchCause((cause) =>
              Console.log(
                `Failed to install Cursor extension ${extensionId}: ${cause.toString()}`
              )
            )
          )
      ),
      { concurrency: 1 }
    );

    yield* Console.log(
      `Applied Cursor profile (${extensionIds.length} extensions)`
    );
  }
);

export const syncCursorProfile = Effect.fn("syncCursorProfile")(function* () {
  const config = yield* DotfilesConfig;
  const command = yield* CommandExecutor;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const cursorPaths = resolveCursorPaths(
    config.dotfilesDir,
    config.homeDir,
    path
  );

  if (!(yield* command.exists("cursor"))) {
    return yield* Effect.fail(new Error("cursor CLI not found"));
  }

  const extensionIds = (yield* command.runText("cursor", ["--list-extensions"]))
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .toSorted();

  const existingExtensions = (yield* fs.exists(cursorPaths.profile))
    ? yield* extractExtensions(
        yield* Schema.decodeUnknownEffect(
          Schema.fromJsonString(CursorProfileSchema)
        )(yield* fs.readFileString(cursorPaths.profile))
      )
    : [];

  const profile = makeProfile({
    existingExtensions,
    extensionIds,
    keybindingsText: yield* fs.readFileString(cursorPaths.keybindings),
    settingsText: yield* fs.readFileString(cursorPaths.settings),
  });

  yield* fs.writeFileString(
    cursorPaths.profile,
    `${JSON.stringify(profile, null, "\t")}\n`
  );
  yield* Console.log(
    `Synced Cursor profile (${extensionIds.length} extensions)`
  );
});

export const showCursorProfilePaths = Effect.fn("showCursorProfilePaths")(
  function* () {
    const config = yield* DotfilesConfig;
    const path = yield* Path.Path;
    const cursorPaths = resolveCursorPaths(
      config.dotfilesDir,
      config.homeDir,
      path
    );
    yield* Console.log(`Profile source: ${cursorPaths.profile}`);
    yield* Console.log(`Cursor user dir: ${cursorPaths.userDir}`);
    yield* Console.log(`Settings target: ${cursorPaths.settings}`);
    yield* Console.log(`Keybindings target: ${cursorPaths.keybindings}`);
    yield* Console.log(`Target parent: ${path.dirname(cursorPaths.userDir)}`);
  }
);

const extractSettingsText = (profile: CursorProfile) =>
  Effect.gen(function* () {
    if (!profile.settings) {
      return null;
    }

    const settingsExport = yield* Schema.decodeUnknownEffect(
      Schema.fromJsonString(CursorSettingsExportSchema)
    )(profile.settings);
    return settingsExport.settings ?? null;
  });

const extractKeybindingsText = (profile: CursorProfile) =>
  Effect.gen(function* () {
    if (!profile.keybindings) {
      return null;
    }

    const keybindingsExport = yield* Schema.decodeUnknownEffect(
      Schema.fromJsonString(CursorKeybindingsExportSchema)
    )(profile.keybindings);
    return keybindingsExport.keybindings ?? null;
  });

const extractExtensions = (profile: CursorProfile) =>
  Effect.gen(function* () {
    if (!profile.extensions) {
      return [] as readonly CursorExtension[];
    }

    return yield* Schema.decodeUnknownEffect(
      Schema.fromJsonString(CursorExtensionsExportSchema)
    )(profile.extensions);
  });

const extractExtensionIds = (profile: CursorProfile) =>
  Effect.gen(function* () {
    const extensions = yield* extractExtensions(profile);
    return extensions
      .map((extension) => extension.identifier?.id)
      .filter((id): id is string => typeof id === "string");
  });

const makeProfile = (input: {
  readonly extensionIds: readonly string[];
  readonly existingExtensions: readonly CursorExtension[];
  readonly keybindingsText: string;
  readonly settingsText: string;
}): CursorProfile => {
  const displayNames = new Map(
    input.existingExtensions.flatMap((extension) => {
      const id = extension.identifier?.id;
      return id && extension.displayName ? [[id, extension.displayName]] : [];
    })
  );
  const preReleaseIds = new Set(
    input.existingExtensions
      .filter((extension) => extension.preRelease)
      .map((extension) => extension.identifier?.id)
      .filter((id): id is string => typeof id === "string")
  );
  const extensions = input.extensionIds.map((id) => ({
    displayName: displayNames.get(id) ?? id,
    identifier: { id },
    ...(preReleaseIds.has(id) ? { preRelease: true } : {}),
  }));

  return {
    extensions: JSON.stringify(extensions, null, "\t"),
    keybindings: JSON.stringify(
      {
        keybindings: `${input.keybindingsText.replace("defaultsauto[]\n[", "defaults\n[").trimEnd()}\n`,
        platform: 1,
      },
      null,
      "\t"
    ),
    name: "cursor-profile",
    settings: JSON.stringify({ settings: `${input.settingsText.trimEnd()}\n` }),
  };
};

const resolveCursorPaths = (
  dotfilesDir: string,
  homeDir: string,
  path: Path.Path
) => {
  const userDir = resolveCursorUserDir(homeDir, path);
  return {
    keybindings: path.join(userDir, "keybindings.json"),
    profile: path.join(dotfilesDir, CURSOR_PROFILE_FILE),
    settings: path.join(userDir, "settings.json"),
    userDir,
  };
};

const resolveCursorUserDir = (homeDir: string, path: Path.Path) => {
  if (platform === "darwin") {
    return path.join(
      homeDir,
      "Library",
      "Application Support",
      "Cursor",
      "User"
    );
  }

  if (platform === "win32") {
    return path.join(
      env.APPDATA ?? path.join(homeDir, "AppData", "Roaming"),
      "Cursor",
      "User"
    );
  }

  return path.join(
    env.XDG_CONFIG_HOME ?? path.join(homeDir, ".config"),
    "Cursor",
    "User"
  );
};
