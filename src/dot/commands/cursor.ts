import { env, platform } from "node:process";

import * as Console from "effect/Console";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
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

const CursorStoredProfileSchema = Schema.Struct({
  location: Schema.String,
  name: Schema.String,
});

const CursorGlobalStorageSchema = Schema.Struct({
  userDataProfiles: Schema.optionalKey(Schema.Array(CursorStoredProfileSchema)),
});

type CursorExtension = typeof CursorExtensionSchema.Type;
type CursorProfile = typeof CursorProfileSchema.Type;
type CursorStoredProfile = typeof CursorStoredProfileSchema.Type;

type CursorExtensionSource =
  | { readonly _tag: "extensions-cache"; readonly path: string }
  | { readonly _tag: "extensions-json"; readonly path: string };

interface CursorSyncSource {
  readonly extensions: CursorExtensionSource;
  readonly keybindings: string;
  readonly location: string;
  readonly name: string;
  readonly settings: string;
}

interface CursorPaths {
  readonly cursorDir: string;
  readonly defaultExtensionsCache: string;
  readonly globalStorage: string;
  readonly keybindings: string;
  readonly profile: string;
  readonly profilesDir: string;
  readonly settings: string;
  readonly userDir: string;
}

export const applyCursorProfile = Effect.fn("applyCursorProfile")(
  function* (options?: { readonly extensions: boolean }) {
    const command = yield* CommandExecutor;
    const fs = yield* FileSystem.FileSystem;
    const cursorPaths = yield* resolveCursorPaths;

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

export const syncCursorProfile = Effect.fn("syncCursorProfile")(
  function* (options?: { readonly profileName?: Option.Option<string> }) {
    const fs = yield* FileSystem.FileSystem;
    const cursorPaths = yield* resolveCursorPaths;

    const requestedProfileName = Option.getOrUndefined(
      options?.profileName ?? Option.none()
    );
    const existingProfile = (yield* fs.exists(cursorPaths.profile))
      ? yield* Schema.decodeUnknownEffect(
          Schema.fromJsonString(CursorProfileSchema)
        )(yield* fs.readFileString(cursorPaths.profile))
      : undefined;
    const existingExtensions = existingProfile
      ? yield* extractExtensions(existingProfile)
      : [];
    const syncSource = yield* resolveCursorSyncSource({
      cursorPaths,
      requestedProfileName,
      savedProfileName: existingProfile?.name,
    });
    const extensions = yield* readCursorExtensions({
      existingExtensions,
      source: syncSource.extensions,
    });
    const keybindingsText = yield* fs.readFileString(syncSource.keybindings);
    const settingsText = yield* fs.readFileString(syncSource.settings);
    yield* assertSanitizedCursorProfileText([
      { label: "settings", text: settingsText },
      { label: "keybindings", text: keybindingsText },
    ]);

    const profile = makeProfile({
      existingExtensions,
      extensions,
      keybindingsText,
      name: syncSource.name,
      settingsText,
    });

    yield* fs.writeFileString(
      cursorPaths.profile,
      `${JSON.stringify(profile, null, "\t")}\n`
    );
    yield* Console.log(
      `Synced Cursor profile "${syncSource.name}" (${extensions.length} extensions)`
    );
  }
);

export const showCursorProfilePaths = Effect.fn("showCursorProfilePaths")(
  function* () {
    const cursorPaths = yield* resolveCursorPaths;
    yield* Console.log(`Profile source: ${cursorPaths.profile}`);
    yield* Console.log(`Cursor user dir: ${cursorPaths.userDir}`);
    yield* Console.log(`Cursor profiles dir: ${cursorPaths.profilesDir}`);
    yield* Console.log(`Settings target: ${cursorPaths.settings}`);
    yield* Console.log(`Keybindings target: ${cursorPaths.keybindings}`);
    yield* Console.log(`Target parent: ${cursorPaths.cursorDir}`);

    const userDataProfiles = yield* readCursorUserDataProfiles(
      cursorPaths
    ).pipe(Effect.catch(() => Effect.succeed([])));
    if (userDataProfiles.length > 0) {
      yield* Console.log(
        `Available Cursor profiles: ${userDataProfiles
          .map((profile) => `${profile.name} (${profile.location})`)
          .join(", ")}`
      );
    }
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

const resolveCursorSyncSource = (input: {
  readonly cursorPaths: CursorPaths;
  readonly requestedProfileName: string | undefined;
  readonly savedProfileName: string | undefined;
}) =>
  Effect.gen(function* () {
    const profiles = yield* readCursorUserDataProfiles(input.cursorPaths);
    const profile = yield* selectCursorProfile({
      profiles,
      requestedProfileName: input.requestedProfileName,
      savedProfileName: input.savedProfileName,
    });

    if (profile === "default") {
      const source = {
        extensions: {
          _tag: "extensions-cache" as const,
          path: input.cursorPaths.defaultExtensionsCache,
        },
        keybindings: input.cursorPaths.keybindings,
        location: "__default__profile__",
        name: input.savedProfileName ?? "cursor-profile",
        settings: input.cursorPaths.settings,
      } satisfies CursorSyncSource;
      yield* requireExistingFile(source.settings, "Cursor settings");
      yield* requireExistingFile(source.keybindings, "Cursor keybindings");
      yield* requireExistingFile(
        source.extensions.path,
        "Cursor default extensions cache"
      );
      return source;
    }

    const path = yield* Path.Path;
    const profileDir = path.join(
      input.cursorPaths.profilesDir,
      profile.location
    );
    const source = {
      extensions: {
        _tag: "extensions-json" as const,
        path: path.join(profileDir, "extensions.json"),
      },
      keybindings: path.join(profileDir, "keybindings.json"),
      location: profile.location,
      name: profile.name,
      settings: path.join(profileDir, "settings.json"),
    } satisfies CursorSyncSource;

    yield* requireExistingFile(source.settings, "Cursor profile settings");
    yield* requireExistingFile(
      source.keybindings,
      "Cursor profile keybindings"
    );
    yield* requireExistingFile(
      source.extensions.path,
      "Cursor profile extensions"
    );
    return source;
  });

const readCursorUserDataProfiles = (cursorPaths: CursorPaths) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    if (!(yield* fs.exists(cursorPaths.globalStorage))) {
      return [] as readonly CursorStoredProfile[];
    }

    const storage = yield* Schema.decodeUnknownEffect(
      Schema.fromJsonString(CursorGlobalStorageSchema)
    )(yield* fs.readFileString(cursorPaths.globalStorage));
    return storage.userDataProfiles ?? [];
  });

class CursorProfileSelectionError extends Data.TaggedError(
  "CursorProfileSelectionError"
)<{
  readonly availableProfiles: readonly CursorStoredProfile[];
  readonly reason: "multiple-profiles" | "profile-not-found";
  readonly requestedProfileName?: string;
}> {
  override get message(): string {
    if (this.reason === "profile-not-found") {
      return `Cursor profile "${this.requestedProfileName}" not found. Available profiles: ${formatAvailableProfiles(this.availableProfiles)}`;
    }

    return `Multiple Cursor profiles found. Pass one to sync: ${formatAvailableProfiles(this.availableProfiles)}`;
  }
}

const selectCursorProfile = (input: {
  readonly profiles: readonly CursorStoredProfile[];
  readonly requestedProfileName: string | undefined;
  readonly savedProfileName: string | undefined;
}) =>
  Effect.gen(function* () {
    const requestedProfileName = input.requestedProfileName?.trim();
    if (requestedProfileName) {
      if (isDefaultProfileName(requestedProfileName)) {
        return "default" as const;
      }

      const requestedProfile = findProfile(
        input.profiles,
        requestedProfileName
      );
      if (requestedProfile) {
        return requestedProfile;
      }

      return yield* Effect.fail(
        new CursorProfileSelectionError({
          availableProfiles: input.profiles,
          reason: "profile-not-found",
          requestedProfileName,
        })
      );
    }

    const savedProfileName = input.savedProfileName?.trim();
    if (savedProfileName) {
      const savedProfile = findProfile(input.profiles, savedProfileName);
      if (savedProfile) {
        return savedProfile;
      }
    }

    if (input.profiles.length === 1) {
      const [onlyProfile] = input.profiles;
      if (onlyProfile) {
        return onlyProfile;
      }
    }

    if (input.profiles.length === 0) {
      return "default" as const;
    }

    return yield* Effect.fail(
      new CursorProfileSelectionError({
        availableProfiles: input.profiles,
        reason: "multiple-profiles",
      })
    );
  });

const findProfile = (
  profiles: readonly CursorStoredProfile[],
  requestedProfileName: string
) =>
  profiles.find(
    (profile) =>
      profile.name === requestedProfileName ||
      profile.location === requestedProfileName
  );

const isDefaultProfileName = (value: string) =>
  value === "default" || value === "__default__profile__";

const formatAvailableProfiles = (profiles: readonly CursorStoredProfile[]) =>
  profiles.length === 0
    ? "default"
    : profiles
        .map((profile) => `${profile.name} (${profile.location})`)
        .join(", ");

const SENSITIVE_CURSOR_PROFILE_PATTERNS = [
  {
    label: "absolute user-home path",
    pattern: /\/(?:Users|home)\/[^/\\s"']+/iu,
  },
  {
    label: "GitHub token",
    pattern: /gh[pousr]_[A-Za-z0-9_]{20,}/u,
  },
  {
    label: "Slack token",
    pattern: /xox[baprs]-[A-Za-z0-9-]{10,}/u,
  },
  {
    label: "Stripe secret key",
    pattern: /sk-[A-Za-z0-9_-]{12,}/u,
  },
  {
    label: "AWS access key",
    pattern: /AKIA[0-9A-Z]{16}/u,
  },
  {
    label: "JWT",
    pattern: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/u,
  },
  {
    label: "private key",
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/u,
  },
] as const;

const assertSanitizedCursorProfileText = (
  chunks: readonly { readonly label: string; readonly text: string }[]
) =>
  Effect.gen(function* () {
    for (const chunk of chunks) {
      const hit = SENSITIVE_CURSOR_PROFILE_PATTERNS.find(({ pattern }) =>
        pattern.test(chunk.text)
      );
      if (hit) {
        return yield* Effect.fail(
          new Error(
            `Cursor profile ${chunk.label} contains ${hit.label}; refusing to sync`
          )
        );
      }
    }
  });

const requireExistingFile = (filePath: string, description: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    if (!(yield* fs.exists(filePath))) {
      return yield* Effect.fail(
        new Error(`${description} not found: ${filePath}`)
      );
    }
  });

const readCursorExtensions = (input: {
  readonly existingExtensions: readonly CursorExtension[];
  readonly source: CursorExtensionSource;
}) =>
  Effect.gen(function* () {
    const rawExtensions = yield* readJsonFile(input.source.path);
    const extensionEntries =
      input.source._tag === "extensions-cache"
        ? asRecord(rawExtensions)?.result
        : rawExtensions;

    if (!Array.isArray(extensionEntries)) {
      return yield* Effect.fail(
        new Error(
          `Cursor extensions source is not a list: ${input.source.path}`
        )
      );
    }

    return yield* sanitizeCursorExtensions({
      existingExtensions: input.existingExtensions,
      rawExtensions: extensionEntries,
    });
  });

const sanitizeCursorExtensions = (input: {
  readonly existingExtensions: readonly CursorExtension[];
  readonly rawExtensions: readonly unknown[];
}) =>
  Effect.gen(function* () {
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
    const extensions = yield* Effect.all(
      input.rawExtensions.map((rawExtension) =>
        sanitizeCursorExtension({
          displayNames,
          preReleaseIds,
          rawExtension,
        })
      ),
      { concurrency: 1 }
    );

    const extensionById = new Map<string, CursorExtension>();
    for (const extension of extensions) {
      const id = extension?.identifier?.id;
      if (id) {
        extensionById.set(id, extension);
      }
    }

    return [...extensionById.values()].toSorted((left, right) =>
      (left.identifier?.id ?? "").localeCompare(right.identifier?.id ?? "")
    );
  });

const sanitizeCursorExtension = (input: {
  readonly displayNames: ReadonlyMap<string, string>;
  readonly preReleaseIds: ReadonlySet<string>;
  readonly rawExtension: unknown;
}) =>
  Effect.gen(function* () {
    const rawExtension = asRecord(input.rawExtension);
    if (!rawExtension) {
      return null;
    }

    const identifier = asRecord(rawExtension.identifier);
    const id = getString(identifier?.id);
    if (!id) {
      return null;
    }

    const packageDisplayName = yield* readExtensionPackageDisplayName({
      rawExtension,
    });

    return {
      displayName: getExtensionDisplayName({
        displayNames: input.displayNames,
        id,
        packageDisplayName,
        rawExtension,
      }),
      identifier: { id },
      ...(isExtensionPreRelease({
        id,
        preReleaseIds: input.preReleaseIds,
        rawExtension,
      })
        ? { preRelease: true }
        : {}),
    } satisfies CursorExtension;
  });

const getExtensionDisplayName = (input: {
  readonly displayNames: ReadonlyMap<string, string>;
  readonly id: string;
  readonly packageDisplayName: string | null;
  readonly rawExtension: Record<string, unknown>;
}) => {
  const manifest = asRecord(input.rawExtension.manifest);
  return (
    getString(input.rawExtension.displayName) ??
    getString(manifest?.displayName) ??
    getString(manifest?.name) ??
    input.packageDisplayName ??
    input.displayNames.get(input.id) ??
    input.id
  );
};

const isExtensionPreRelease = (input: {
  readonly id: string;
  readonly preReleaseIds: ReadonlySet<string>;
  readonly rawExtension: Record<string, unknown>;
}) => {
  const metadata = asRecord(input.rawExtension.metadata);
  return (
    getBoolean(input.rawExtension.preRelease) ??
    getBoolean(metadata?.preRelease) ??
    getBoolean(metadata?.isPreReleaseVersion) ??
    input.preReleaseIds.has(input.id)
  );
};

const readExtensionPackageDisplayName = (input: {
  readonly rawExtension: Record<string, unknown>;
}) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const location = asRecord(input.rawExtension.location);
    const locationPath = getString(location?.path);
    if (!locationPath) {
      return null;
    }

    const packageJsonPath = path.join(locationPath, "package.json");
    if (!(yield* fs.exists(packageJsonPath))) {
      return null;
    }

    const packageJson = yield* readJsonFile(packageJsonPath).pipe(
      Effect.catch(() => Effect.succeed(null))
    );
    const packageRecord = asRecord(packageJson);
    const displayName = getString(packageRecord?.displayName);
    const localizedDisplayName = displayName
      ? yield* readPackageNlsString({
          packageDir: locationPath,
          value: displayName,
        })
      : null;

    return (
      localizedDisplayName ??
      (isLocalizedPackageValue(displayName) ? null : displayName) ??
      getString(packageRecord?.name) ??
      null
    );
  });

const readPackageNlsString = (input: {
  readonly packageDir: string;
  readonly value: string;
}) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const key = getLocalizedPackageKey(input.value);
    if (!key) {
      return null;
    }

    const packageNlsPath = path.join(input.packageDir, "package.nls.json");
    if (!(yield* fs.exists(packageNlsPath))) {
      return null;
    }

    const packageNls = yield* readJsonFile(packageNlsPath).pipe(
      Effect.catch(() => Effect.succeed(null))
    );
    return getString(asRecord(packageNls)?.[key]) ?? null;
  });

const getLocalizedPackageKey = (value: string) =>
  value.startsWith("%") && value.endsWith("%") ? value.slice(1, -1) : null;

const isLocalizedPackageValue = (value: string | undefined) =>
  value ? getLocalizedPackageKey(value) !== null : false;

const readJsonFile = (filePath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const text = yield* fs.readFileString(filePath);
    return yield* Effect.try({
      catch: (error) =>
        new Error(
          `Failed to parse JSON at ${filePath}: ${toError(error).message}`
        ),
      try: () => JSON.parse(text) as unknown,
    });
  });

const toError = (error: unknown) =>
  error instanceof Error ? error : new Error(String(error));

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const getString = (value: unknown) =>
  typeof value === "string" && value.trim() ? value : undefined;

const getBoolean = (value: unknown) =>
  typeof value === "boolean" ? value : undefined;

const makeProfile = (input: {
  readonly existingExtensions: readonly CursorExtension[];
  readonly extensions: readonly CursorExtension[];
  readonly keybindingsText: string;
  readonly name: string;
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
  const extensions = input.extensions.map((extension) => {
    const id = extension.identifier?.id ?? "";
    return {
      displayName: extension.displayName ?? displayNames.get(id) ?? id,
      identifier: { id },
      ...(extension.preRelease || preReleaseIds.has(id)
        ? { preRelease: true }
        : {}),
    };
  });

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
    name: input.name,
    settings: JSON.stringify({ settings: `${input.settingsText.trimEnd()}\n` }),
  };
};

const resolveCursorPaths = Effect.gen(function* () {
  const config = yield* DotfilesConfig;
  const path = yield* Path.Path;
  const userDir = yield* resolveCursorUserDir;
  const cursorDir = path.dirname(userDir);
  return {
    cursorDir,
    defaultExtensionsCache: path.join(
      cursorDir,
      "CachedProfilesData",
      "__default__profile__",
      "extensions.user.cache"
    ),
    globalStorage: path.join(userDir, "globalStorage", "storage.json"),
    keybindings: path.join(userDir, "keybindings.json"),
    profile: path.join(config.dotfilesDir, CURSOR_PROFILE_FILE),
    profilesDir: path.join(userDir, "profiles"),
    settings: path.join(userDir, "settings.json"),
    userDir,
  } satisfies CursorPaths;
});

const resolveCursorUserDir = Effect.gen(function* () {
  const config = yield* DotfilesConfig;
  const path = yield* Path.Path;
  if (platform === "darwin") {
    return path.join(
      config.homeDir,
      "Library",
      "Application Support",
      "Cursor",
      "User"
    );
  }

  if (platform === "win32") {
    return path.join(
      env.APPDATA ?? path.join(config.homeDir, "AppData", "Roaming"),
      "Cursor",
      "User"
    );
  }

  return path.join(
    env.XDG_CONFIG_HOME ?? path.join(config.homeDir, ".config"),
    "Cursor",
    "User"
  );
});
