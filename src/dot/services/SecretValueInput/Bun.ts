import * as Effect from "effect/Effect";

import type { SecretValueInputShape } from "./index.ts";

export const makeBunSecretValueInput = Effect.sync(
  () =>
    ({
      promptHidden: (name: string) =>
        Effect.promise(async () => {
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
        }),
      readStdin: () =>
        Effect.promise(async () => {
          const text = await Bun.stdin.text();

          return text.trimEnd();
        }),
    }) satisfies SecretValueInputShape
);
