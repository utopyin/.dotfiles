import type * as Effect from "effect/Effect";

import type { SecretManagerError } from "./errors.ts";

export interface SecretManagerShape {
  readonly accountList: () => Effect.Effect<string, SecretManagerError>;
  readonly archiveItem: (
    title: string,
    vault: string
  ) => Effect.Effect<void, SecretManagerError>;
  readonly createPasswordItem: (
    title: string,
    value: string,
    vault: string
  ) => Effect.Effect<void, SecretManagerError>;
  readonly inject: (
    templatePath: string,
    outputPath: string
  ) => Effect.Effect<void, SecretManagerError>;
  readonly isInstalled: () => Effect.Effect<boolean>;
  readonly isSignedIn: () => Effect.Effect<boolean>;
  readonly itemExists: (title: string, vault: string) => Effect.Effect<boolean>;
  readonly itemTitles: (
    vault: string
  ) => Effect.Effect<ReadonlySet<string>, SecretManagerError>;
  readonly updatePasswordItem: (
    title: string,
    value: string,
    vault: string
  ) => Effect.Effect<void, SecretManagerError>;
}
