import * as Argument from "effect/unstable/cli/Argument";
import * as Command from "effect/unstable/cli/Command";
import * as Flag from "effect/unstable/cli/Flag";

import { installCompletion } from "./commands/completions.ts";
import {
  showCursorProfilePaths,
  syncCursorProfile,
} from "./commands/cursor.ts";
import { doctor } from "./commands/doctor.ts";
import { edit } from "./commands/edit.ts";
import { init } from "./commands/init.ts";
import { link, unlink } from "./commands/link.ts";
import {
  packageAdd,
  packageList,
  packageRemove,
  packageUpdate,
} from "./commands/package.ts";
import { piAdd } from "./commands/pi.ts";
import {
  secretsAdd,
  secretsDoctor,
  secretsRemove,
  secretsRender,
} from "./commands/secrets.ts";
import { applyConfigFromCli, unapplyConfig } from "./commands/stow.ts";
import { update } from "./commands/update.ts";

export const cli = Command.make("dot").pipe(
  Command.withDescription("Manage utopy dotfiles"),
  Command.withSubcommands([
    Command.make("doctor").pipe(
      Command.withDescription(
        "Check dotfiles, tools, symlinks, and secret hygiene"
      ),
      Command.withHandler(doctor)
    ),

    Command.make("init").pipe(
      Command.withDescription("Bootstrap this machine"),
      Command.withHandler(init)
    ),

    Command.make("update").pipe(
      Command.withDescription("Pull dotfiles, update packages, apply config"),
      Command.withHandler(update)
    ),

    Command.make("apply", {
      cursor: Flag.boolean("cursor").pipe(
        Flag.withDescription(
          "Apply the sanitized Cursor profile without prompting"
        )
      ),
      noCursorExtensions: Flag.boolean("no-cursor-extensions").pipe(
        Flag.withDescription("With --cursor, skip Cursor extension installs")
      ),
      yes: Flag.boolean("yes").pipe(
        Flag.withDescription("Use defaults for prompts (does not apply Cursor)")
      ),
    }).pipe(
      Command.withAlias("stow"),
      Command.withDescription("Apply home/ config links into $HOME"),
      Command.withHandler(applyConfigFromCli)
    ),

    Command.make("unapply").pipe(
      Command.withAlias("unstow"),
      Command.withDescription("Remove home/ config links from $HOME"),
      Command.withHandler(unapplyConfig)
    ),

    Command.make("link").pipe(
      Command.withDescription("Install dot command into ~/.local/bin"),
      Command.withHandler(link)
    ),

    Command.make("edit", {
      target: Argument.optional(Argument.path("TARGET")),
    }).pipe(
      Command.withDescription(
        "Open the dotfiles repo or a tracked path in $VISUAL/$EDITOR"
      ),
      Command.withHandler(({ target }) => edit({ target }))
    ),

    Command.make("unlink").pipe(
      Command.withDescription("Remove ~/.local/bin/dot"),
      Command.withHandler(unlink)
    ),

    Command.make("package").pipe(
      Command.withDescription("Package helpers"),
      Command.withSubcommands([
        Command.make("add", {
          id: Flag.optional(Flag.integer("id")).pipe(
            Flag.withDescription("Mac App Store id, required for --kind mas")
          ),
          kind: Flag.choice("kind", [
            "brew",
            "cask",
            "mas",
            "tap",
          ] as const).pipe(
            Flag.withDefault("brew"),
            Flag.withDescription("Package manifest entry kind")
          ),
          name: Argument.string("NAME"),
        }).pipe(
          Command.withDescription("Add a package to the package manifest"),
          Command.withHandler(({ id, kind, name }) =>
            packageAdd(name, { id, kind })
          )
        ),
        Command.make("remove", {
          kind: Flag.choice("kind", [
            "brew",
            "cask",
            "mas",
            "tap",
          ] as const).pipe(
            Flag.withDefault("brew"),
            Flag.withDescription("Package manifest entry kind")
          ),
          name: Argument.string("NAME"),
        }).pipe(
          Command.withAlias("rm"),
          Command.withDescription("Remove a package from the package manifest"),
          Command.withHandler(({ kind, name }) => packageRemove(name, { kind }))
        ),
        Command.make("update").pipe(
          Command.withDescription(
            "Update installed packages from the manifest"
          ),
          Command.withHandler(packageUpdate)
        ),
        Command.make("list").pipe(Command.withHandler(packageList)),
      ])
    ),

    Command.make("cursor").pipe(
      Command.withDescription("Manage the sanitized Cursor profile"),
      Command.withSubcommands([
        Command.make("sync").pipe(
          Command.withDescription(
            "Sync cursor-profile.code-profile from Cursor's current config"
          ),
          Command.withHandler(syncCursorProfile)
        ),
        Command.make("paths").pipe(Command.withHandler(showCursorProfilePaths)),
      ])
    ),

    Command.make("pi").pipe(
      Command.withDescription("Manage vendored Pi packages"),
      Command.withSubcommands([
        Command.make("add", {
          ref: Flag.optional(Flag.string("ref")).pipe(
            Flag.withDescription("Git ref to checkout after cloning")
          ),
          source: Argument.string("SOURCE"),
        }).pipe(
          Command.withDescription(
            "Clone, clean, and wire a local Pi package into tracked Pi settings"
          ),
          Command.withHandler(({ ref, source }) => piAdd({ ref, source }))
        ),
      ])
    ),

    Command.make("completions").pipe(
      Command.withDescription(
        "Install shell completions generated by other CLIs"
      ),
      Command.withSubcommands([
        Command.make("add", {
          name: Argument.string("COMMAND_NAME"),
          noApply: Flag.boolean("no-apply").pipe(
            Flag.withDescription(
              "Write the completion file without applying home config links"
            )
          ),
          shell: Flag.choice("shell", ["zsh"] as const).pipe(
            Flag.withDefault("zsh"),
            Flag.withDescription("Completion shell format")
          ),
        }).pipe(
          Command.withDescription(
            "Read completion script from stdin and install it"
          ),
          Command.withHandler(({ name, noApply, shell }) =>
            installCompletion(name, { apply: !noApply, shell })
          )
        ),
      ])
    ),

    Command.make("secrets").pipe(
      Command.withAlias("secret"),
      Command.withDescription("Manage local development secrets"),
      Command.withSubcommands([
        Command.make("doctor").pipe(Command.withHandler(secretsDoctor)),
        Command.make("render").pipe(Command.withHandler(secretsRender)),
        Command.make("add", {
          name: Argument.string("ENV_NAME"),
          valueStdin: Flag.boolean("value-stdin").pipe(
            Flag.withDescription(
              "Read secret value from stdin instead of prompting"
            )
          ),
        }).pipe(
          Command.withDescription(
            "Add/update a secret; prompts by default, or use --value-stdin"
          ),
          Command.withHandler(({ name, valueStdin }) =>
            secretsAdd(name, { valueSource: valueStdin ? "stdin" : "prompt" })
          )
        ),
        Command.make("remove", { name: Argument.string("ENV_NAME") }).pipe(
          Command.withAlias("rm"),
          Command.withAlias("delete"),
          Command.withHandler(({ name }) => secretsRemove(name))
        ),
      ])
    ),
  ])
);

export const runCli = cli.pipe(Command.run({ version: "0.1.0-effect" }));
