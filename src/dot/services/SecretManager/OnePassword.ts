import * as Effect from "effect/Effect";

import { CommandExecutor } from "../CommandExecutor/index.ts";
import { SecretManagerError } from "./errors.ts";
import type { SecretManagerShape } from "./types.ts";

export const makeOnePasswordSecretManager = Effect.gen(function* () {
  const command = yield* CommandExecutor;

  return {
    accountList: Effect.fn("OnePasswordSecretManager.accountList")(
      function* () {
        return yield* command
          .runText("op", ["account", "list"])
          .pipe(Effect.mapError(mapOpError("account list")));
      }
    ),

    archiveItem: Effect.fn("OnePasswordSecretManager.archiveItem")(function* (
      title: string,
      vault: string
    ) {
      yield* command
        .run("op", ["item", "delete", title, "--vault", vault, "--archive"])
        .pipe(Effect.asVoid, Effect.mapError(mapOpError("item delete")));
    }),

    createPasswordItem: Effect.fn(
      "OnePasswordSecretManager.createPasswordItem"
    )(function* (title: string, value: string, vault: string) {
      yield* command
        .run("op", [
          "item",
          "create",
          "--vault",
          vault,
          "--category",
          "Password",
          "--title",
          title,
          `password=${value}`,
        ])
        .pipe(Effect.asVoid, Effect.mapError(mapOpError("item create")));
    }),

    inject: Effect.fn("OnePasswordSecretManager.inject")(function* (
      templatePath: string,
      outputPath: string
    ) {
      yield* command
        .run("op", [
          "inject",
          "--force",
          "--in-file",
          templatePath,
          "--out-file",
          outputPath,
        ])
        .pipe(Effect.asVoid, Effect.mapError(mapOpError("inject")));
    }),

    isInstalled: Effect.fn("OnePasswordSecretManager.isInstalled")(
      function* () {
        return yield* command.exists("op");
      }
    ),

    isSignedIn: Effect.fn("OnePasswordSecretManager.isSignedIn")(function* () {
      return yield* command.run("op", ["whoami"]).pipe(
        Effect.as(true),
        Effect.catchCause(() => Effect.succeed(false))
      );
    }),

    itemExists: Effect.fn("OnePasswordSecretManager.itemExists")(function* (
      title: string,
      vault: string
    ) {
      return yield* command
        .run("op", ["item", "get", title, "--vault", vault])
        .pipe(
          Effect.as(true),
          Effect.catchCause(() => Effect.succeed(false))
        );
    }),

    updatePasswordItem: Effect.fn(
      "OnePasswordSecretManager.updatePasswordItem"
    )(function* (title: string, value: string, vault: string) {
      yield* command
        .run("op", [
          "item",
          "edit",
          title,
          "--vault",
          vault,
          `password=${value}`,
        ])
        .pipe(Effect.asVoid, Effect.mapError(mapOpError("item edit")));
    }),
  } satisfies SecretManagerShape;
});

const mapOpError = (operation: string) => (error: unknown) =>
  new SecretManagerError({
    operation,
    provider: "1Password",
    reason: error instanceof Error ? error.message : String(error),
  });
