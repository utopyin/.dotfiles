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
      return yield* command.run("op", ["vault", "list", "--format=json"]).pipe(
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

    itemTitles: Effect.fn("OnePasswordSecretManager.itemTitles")(function* (
      vault: string
    ) {
      const output = yield* command
        .runText("op", ["item", "list", "--vault", vault, "--format=json"])
        .pipe(Effect.mapError(mapOpError("item list")));
      return yield* parseItemTitles(output);
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

interface OnePasswordItemSummary {
  readonly title?: unknown;
}

export const parseItemTitles = Effect.fn(
  "OnePasswordSecretManager.parseItemTitles"
)(function* (output: string) {
  const items = yield* Effect.try({
    catch: (cause) =>
      new SecretManagerError({
        operation: "item list",
        provider: "1Password",
        reason: cause instanceof Error ? cause.message : String(cause),
      }),
    try: () => JSON.parse(output) as readonly OnePasswordItemSummary[],
  });
  return new Set(
    items.flatMap((item) =>
      typeof item.title === "string" ? [item.title] : []
    )
  );
});

const mapOpError = (operation: string) => (error: unknown) =>
  new SecretManagerError({
    operation,
    provider: "1Password",
    reason: error instanceof Error ? error.message : String(error),
  });
