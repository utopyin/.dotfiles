import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";

import { DotfilesConfig } from "../Config.ts";

export type DotLinkMode = "dev" | "release";

export class BinaryLinker extends Context.Service<BinaryLinker>()(
  "dot/BinaryLinker",
  {
    make: Effect.gen(function* () {
      const config = yield* DotfilesConfig;
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;

      const releaseTarget = path.join(config.dotfilesDir, "dist", "dot");
      const devTarget = path.join(config.dotfilesDir, "bin", "dot.ts");
      const linkParent = path.dirname(config.localBinDotPath);
      const makeDevShim = () => `#!/usr/bin/env sh
export DOTFILES_DIR=${shellQuote(config.dotfilesDir)}
exec bun ${shellQuote(devTarget)} "$@"
`;

      const prepareLinkPath = Effect.gen(function* () {
        yield* fs.makeDirectory(linkParent, { recursive: true });
        yield* fs.remove(config.localBinDotPath, { force: true });
      });

      return {
        currentDotResolution: Effect.sync(() => config.localBinDotPath),

        linkDot: Effect.fn("BinaryLinker.linkDot")(function* (
          mode: DotLinkMode = "release"
        ) {
          yield* prepareLinkPath;

          if (mode === "dev") {
            yield* fs.writeFileString(config.localBinDotPath, makeDevShim());
            yield* fs.chmod(config.localBinDotPath, 0o755);
            return;
          }

          yield* fs.symlink(releaseTarget, config.localBinDotPath);
        }),

        unlinkDot: fs.remove(config.localBinDotPath, { force: true }),
      } as const;
    }),
  }
) {
  static readonly Live = Layer.effect(this, this.make);
}

const shellQuote = (value: string) => `'${value.replaceAll("'", `'"'"'`)}'`;
