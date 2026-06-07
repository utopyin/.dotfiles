import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";

import { DotfilesConfig } from "../Config.ts";

export class BinaryLinker extends Context.Service<BinaryLinker>()(
  "dot/BinaryLinker",
  {
    make: Effect.gen(function* () {
      const config = yield* DotfilesConfig;
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;

      const target = path.join(config.dotfilesDir, "dist", "dot");

      return {
        currentDotResolution: Effect.sync(() => config.localBinDotPath),

        linkDot: Effect.gen(function* () {
          yield* fs.makeDirectory(path.dirname(config.localBinDotPath), {
            recursive: true,
          });

          const exists = yield* fs.exists(config.localBinDotPath);

          if (exists) {
            yield* fs.remove(config.localBinDotPath);
          }

          yield* fs.symlink(target, config.localBinDotPath);
        }),

        unlinkDot: Effect.gen(function* () {
          const exists = yield* fs.exists(config.localBinDotPath);

          if (exists) {
            yield* fs.remove(config.localBinDotPath);
          }
        }),
      } as const;
    }),
  }
) {
  static readonly Live = Layer.effect(this, this.make);
}
