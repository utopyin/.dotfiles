import * as Context from "effect/Context";
import * as Layer from "effect/Layer";

import { makeOnePasswordSecretManager } from "./OnePassword.ts";

export { SecretManagerError } from "./errors.ts";
export type { SecretManagerShape } from "./types.ts";

export class SecretManager extends Context.Service<SecretManager>()(
  "dot/SecretManager",
  {
    make: makeOnePasswordSecretManager,
  }
) {
  static readonly OnePassword = Layer.effect(
    this,
    makeOnePasswordSecretManager
  );
}
