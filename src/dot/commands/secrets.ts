import * as Console from "effect/Console";
import * as Effect from "effect/Effect";

import { Secrets } from "../services/Secrets.ts";

export const secretsDoctor = Effect.fn("secretsDoctor")(function* () {
  const secrets = yield* Secrets;
  for (const line of yield* secrets.doctor()) {
    yield* Console.log(line);
  }
});

export const secretsRender = Effect.fn("secretsRender")(function* () {
  const secrets = yield* Secrets;
  yield* secrets.render();
  yield* Console.log("Rendered secrets");
});

export interface SecretsAddOptions {
  readonly valueSource: "prompt" | "stdin";
}

export const secretsAdd = Effect.fn("secretsAdd")(function* (
  name: string,
  options: SecretsAddOptions
) {
  const secrets = yield* Secrets;
  yield* secrets.add(name, options.valueSource);
  yield* Console.log(`Added secret ${name}`);
});

export const secretsRemove = Effect.fn("secretsRemove")(function* (
  name: string
) {
  const secrets = yield* Secrets;
  yield* secrets.remove(name);
  yield* Console.log(`Removed secret ${name}`);
});
