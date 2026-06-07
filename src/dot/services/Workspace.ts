/**
 * Dotfiles workspace metadata and checks.
 *
 * This service answers questions about the repository as a workspace: VCS status,
 * VCS metadata and scans that protect publishability. It is not
 * the Git service; Git-specific behavior stays behind FileVersioning.
 */
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { DotfilesConfig } from "../Config.ts";
import { CommandExecutor } from "./CommandExecutor/index.ts";
import { FileVersioning } from "./FileVersioning/index.ts";

export class Workspace extends Context.Service<Workspace>()("dot/Workspace", {
  make: Effect.gen(function* () {
    const config = yield* DotfilesConfig;
    const commands = yield* CommandExecutor;
    const vcs = yield* FileVersioning;
    return {
      remoteSummary: vcs.remoteSummary(config.dotfilesDir),
      secretValueScan: commands.runText("/bin/sh", [
        "-lc",
        `grep -RInE '^[[:space:]]*export [A-Z0-9_]*(TOKEN|KEY|SECRET|PASSWORD|BEARER)[A-Z0-9_]*=' ${JSON.stringify(config.dotfilesDir)} --exclude-dir=.git --exclude-dir=node_modules --exclude='*.md' --exclude='secrets.template.zsh' --exclude='secrets.example.zsh' || true`,
      ]),
      status: vcs.status(config.dotfilesDir),
    } as const;
  }),
}) {
  static readonly Live = Layer.effect(this, this.make);
}
