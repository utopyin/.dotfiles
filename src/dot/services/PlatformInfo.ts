import { platform } from "node:os";

import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";

export type OperatingSystem = "darwin" | "linux";

export type Environment = "macos" | "omarchy" | "ubuntu";

export interface PlatformInfoShape {
  readonly architecture: string;
  readonly distroId: string | undefined;
  readonly distroLike: readonly string[];
  readonly environment: Environment;
  readonly os: OperatingSystem;
}

export class UnsupportedPlatformError extends Data.TaggedError(
  "UnsupportedPlatformError"
)<{
  readonly detectedPlatform: string;
}> {
  override get message(): string {
    return `Unsupported platform: ${this.detectedPlatform}`;
  }
}

export const makePlatformInfo = Effect.fn("PlatformInfo.make")(function* () {
  const detected = platform();
  if (detected !== "darwin" && detected !== "linux") {
    return yield* new UnsupportedPlatformError({ detectedPlatform: detected });
  }

  const fs = yield* FileSystem.FileSystem;
  const release =
    detected === "linux" && (yield* fs.exists("/etc/os-release"))
      ? yield* fs.readFileString("/etc/os-release")
      : "";
  const values = parseOsRelease(release);
  const distroId = values.ID;
  const distroLike = values.ID_LIKE?.split(/\s+/u).filter(Boolean) ?? [];
  const environment = resolveEnvironment(detected, distroId, distroLike);
  if (environment === undefined) {
    return yield* new UnsupportedPlatformError({
      detectedPlatform: `${detected}/${distroId ?? "unknown"}`,
    });
  }

  return {
    architecture: process.arch,
    distroId,
    distroLike,
    environment,
    os: detected,
  } satisfies PlatformInfoShape;
});

export const resolveEnvironment = (
  os: OperatingSystem,
  distroId: string | undefined,
  distroLike: readonly string[]
): Environment | undefined => {
  if (os === "darwin") {
    return "macos";
  }
  if (distroId === "omarchy") {
    return "omarchy";
  }
  if (distroId === "ubuntu" || distroLike.includes("ubuntu")) {
    return "ubuntu";
  }
  return undefined;
};

export const parseOsRelease = (content: string): Record<string, string> =>
  Object.fromEntries(
    content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"))
      .flatMap((line) => {
        const separator = line.indexOf("=");
        if (separator < 1) {
          return [];
        }
        const key = line.slice(0, separator);
        const value = line.slice(separator + 1).replaceAll(/^['"]|['"]$/gu, "");
        return [[key, value]];
      })
  );

export class PlatformInfo extends Context.Service<PlatformInfo>()(
  "dot/PlatformInfo",
  { make: makePlatformInfo }
) {
  static readonly Live = Layer.effect(this, makePlatformInfo());
}
