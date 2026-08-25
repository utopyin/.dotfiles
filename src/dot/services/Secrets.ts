import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";

import { DotfilesConfig } from "../Config.ts";
import { SecretManager } from "./SecretManager/index.ts";
import { SecretNameError, SecretValueError } from "./SecretsErrors.ts";
import { SecretValueInput } from "./SecretValueInput/index.ts";

const envNamePattern = /^[A-Z_][A-Z0-9_]*$/u;
const onePasswordRefPattern = /op:\/\/([^/]+)\/([^/]+)\/password/gu;

interface SecretRef {
  readonly title: string;
  readonly vault: string;
}

export interface SecretsShape {
  readonly add: (
    name: string,
    source: "prompt" | "stdin"
  ) => Effect.Effect<void, unknown, unknown>;
  readonly doctor: () => Effect.Effect<readonly string[], unknown, unknown>;
  readonly remove: (name: string) => Effect.Effect<void, unknown, unknown>;
  readonly render: () => Effect.Effect<void, unknown, unknown>;
}

export class Secrets extends Context.Service<Secrets>()("dot/Secrets", {
  make: Effect.gen(function* () {
    const config = yield* DotfilesConfig;
    const manager = yield* SecretManager;
    const input = yield* SecretValueInput;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const render = Effect.fn("Secrets.render")(function* () {
      yield* fs.makeDirectory(path.dirname(config.secretsOutputPath), {
        recursive: true,
      });
      yield* manager.inject(
        config.secretsTemplatePath,
        config.secretsOutputPath
      );
      yield* fs.chmod(config.secretsOutputPath, 0o600);
    });

    return {
      add: Effect.fn("Secrets.add")(function* (
        name: string,
        source: "prompt" | "stdin"
      ) {
        yield* ensureName(name);

        const value =
          source === "stdin"
            ? yield* input.readStdin()
            : yield* input.promptHidden(name);

        if (value.length === 0) {
          return yield* new SecretValueError({ reason: "empty" });
        }

        const title = titleFor(name);
        const exists = yield* manager.itemExists(title, config.secretsVault);

        yield* exists
          ? manager.updatePasswordItem(title, value, config.secretsVault)
          : manager.createPasswordItem(title, value, config.secretsVault);

        yield* fs.makeDirectory(path.dirname(config.secretsTemplatePath), {
          recursive: true,
        });

        const current = (yield* fs.exists(config.secretsTemplatePath))
          ? yield* fs.readFileString(config.secretsTemplatePath)
          : "";
        const line = exportLine(name, refFor(config.secretsVault, name));

        yield* fs.writeFileString(
          config.secretsTemplatePath,
          upsertTemplateLine(current, name, line)
        );
        yield* render();
      }),

      doctor: Effect.fn("Secrets.doctor")(function* () {
        const installed = yield* manager.isInstalled();
        const templateExists = yield* fs.exists(config.secretsTemplatePath);
        const outputExists = yield* fs.exists(config.secretsOutputPath);
        const refs: readonly SecretRef[] = templateExists
          ? secretRefs(yield* fs.readFileString(config.secretsTemplatePath))
          : [];
        const vaults = [...new Set(refs.map(({ vault }) => vault))];
        const signedInWithoutRefs =
          installed && refs.length === 0 ? yield* manager.isSignedIn() : false;
        const vaultItems = installed
          ? yield* Effect.all(
              vaults.map((vault) =>
                manager.itemTitles(vault).pipe(
                  Effect.option,
                  Effect.map((titles) => [vault, titles] as const)
                )
              )
            )
          : [];
        const titlesByVault = new Map(vaultItems);
        const sessionAvailable =
          installed &&
          (vaults.length === 0
            ? signedInWithoutRefs
            : vaultItems.every(([, items]) => items._tag === "Some"));
        const itemLines: readonly string[] = refs.map(({ title, vault }) => {
          const titles = titlesByVault.get(vault);
          if (titles?._tag !== "Some") {
            return `1Password item not checked: ${vault}/${title}`;
          }
          return titles.value.has(title)
            ? `1Password item exists: ${vault}/${title}`
            : `1Password item missing: ${vault}/${title}`;
        });

        return [
          installed ? "1Password CLI: installed" : "1Password CLI: missing",
          ...(installed
            ? [
                sessionAvailable
                  ? "1Password session: signed in"
                  : "1Password session: not signed in",
              ]
            : []),
          `Secrets template: ${config.secretsTemplatePath}`,
          `Secrets output: ${config.secretsOutputPath}`,
          templateExists
            ? "Secrets template exists"
            : "Secrets template missing",
          outputExists
            ? "Rendered secrets file exists"
            : "Rendered secrets file missing",
          ...itemLines,
        ];
      }),

      remove: Effect.fn("Secrets.remove")(function* (name: string) {
        yield* ensureName(name);

        if (yield* fs.exists(config.secretsTemplatePath)) {
          yield* fs.writeFileString(
            config.secretsTemplatePath,
            removeTemplateLine(
              yield* fs.readFileString(config.secretsTemplatePath),
              name
            )
          );
        }

        const title = titleFor(name);

        if (yield* manager.itemExists(title, config.secretsVault)) {
          yield* manager.archiveItem(title, config.secretsVault);
        }

        yield* render();
      }),

      render,
    } satisfies SecretsShape;
  }),
}) {
  static readonly Live = Layer.effect(this, this.make);
}

const ensureName = Effect.fn("Secrets.ensureName")(function* (name: string) {
  if (envNamePattern.test(name)) {
    return name;
  }

  return yield* new SecretNameError({ name });
});

const exportLine = (name: string, ref: string) => `export ${name}="${ref}"`;

const refFor = (vault: string, name: string) =>
  `op://${vault}/${titleFor(name)}/password`;

const removeTemplateLine = (current: string, name: string) =>
  current
    .split("\n")
    .filter((line) => !line.startsWith(`export ${name}=`))
    .join("\n");

const secretRefs = (template: string): readonly SecretRef[] =>
  [...template.matchAll(onePasswordRefPattern)].map((match) => ({
    title: decodeURIComponent(match[2] ?? ""),
    vault: decodeURIComponent(match[1] ?? ""),
  }));

const titleFor = (name: string) => `Dotfiles ${name}`;

const upsertTemplateLine = (current: string, name: string, line: string) => {
  const lines = current.split("\n").filter((item) => item.length > 0);
  const index = lines.findIndex((item) => item.startsWith(`export ${name}=`));

  if (index === -1) {
    lines.push(line);
  } else {
    lines[index] = line;
  }

  return `${lines.join("\n")}\n`;
};
