import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { makeBunSecretValueInput } from "./Bun.ts";

export interface SecretValueInputShape {
  readonly promptHidden: (name: string) => Effect.Effect<string>;
  readonly readStdin: () => Effect.Effect<string>;
}

export class SecretValueInput extends Context.Service<SecretValueInput>()(
  "dot/SecretValueInput",
  {
    make: makeBunSecretValueInput,
  }
) {
  static readonly Bun = Layer.effect(this, makeBunSecretValueInput);
}
