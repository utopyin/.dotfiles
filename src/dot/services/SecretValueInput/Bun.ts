import * as Effect from "effect/Effect";

import type { SecretValueInputShape } from "./index.ts";

export const makeBunSecretValueInput = Effect.sync(
  () =>
    ({
      promptHidden: Effect.fn("BunSecretValueInput.promptHidden")(function* (
        name: string
      ) {
        return yield* Effect.promise(async () => {
          // Bun has no stable cross-terminal hidden prompt API here yet; use shell `read -s`.
          const proc = Bun.spawn(
            [
              "/bin/zsh",
              "-fc",
              `printf 'Enter value for ${name}: ' >&2; IFS= read -rs value; printf '\\n' >&2; printf %s "$value"`,
            ],
            {
              stderr: "inherit",
              stdout: "pipe",
            }
          );
          const text = await new Response(proc.stdout).text();

          return text.trimEnd();
        });
      }),
      readStdin: Effect.fn("BunSecretValueInput.readStdin")(function* () {
        const text = yield* Effect.promise(() => Bun.stdin.text());

        return text.trimEnd();
      }),
    }) satisfies SecretValueInputShape
);
