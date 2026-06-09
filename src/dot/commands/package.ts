import * as Console from "effect/Console";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { DotfilesConfig } from "../Config.ts";
import type { PackageKind } from "../services/PackageInstaller/index.ts";
import { PackageInstaller } from "../services/PackageInstaller/index.ts";

export interface PackageAddOptions {
  readonly id: Option.Option<number>;
  readonly kind: PackageKind;
}

export interface PackageRemoveOptions {
  readonly kind: PackageKind;
}

class PackageCommandError extends Data.TaggedError("PackageCommandError")<{
  readonly reason: "missing-mas-id";
}> {
  override get message(): string {
    return this.reason === "missing-mas-id"
      ? "dot package add --kind mas requires --id"
      : this.reason;
  }
}

export const packageAdd = Effect.fn("packageAdd")(function* (
  name: string,
  options: PackageAddOptions
) {
  const config = yield* DotfilesConfig;
  const installer = yield* PackageInstaller;
  if (options.kind === "mas" && Option.isNone(options.id)) {
    return yield* new PackageCommandError({ reason: "missing-mas-id" });
  }
  const id = Option.getOrUndefined(options.id);
  yield* installer.addToManifest(config.brewfilePath, {
    ...(id === undefined ? {} : { id }),
    kind: options.kind,
    name,
  });
  yield* Console.log(`Added ${options.kind} package ${name}`);
});

export const packageList = Effect.fn("packageList")(function* () {
  const config = yield* DotfilesConfig;
  const installer = yield* PackageInstaller;
  const manifest = yield* installer.listManifest(config.brewfilePath);
  yield* Console.log(manifest);
});

export const packageRemove = Effect.fn("packageRemove")(function* (
  name: string,
  options: PackageRemoveOptions
) {
  const config = yield* DotfilesConfig;
  const installer = yield* PackageInstaller;
  yield* installer.removeFromManifest(config.brewfilePath, {
    kind: options.kind,
    name,
  });
  yield* Console.log(`Removed ${options.kind} package ${name}`);
});

export const packageUpdate = Effect.fn("packageUpdate")(function* () {
  const config = yield* DotfilesConfig;
  const installer = yield* PackageInstaller;
  yield* installer.updateAll(config.brewfilePath);
  yield* Console.log("Updated packages");
});
