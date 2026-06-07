# Effect V4 `dot` CLI Plan

Goal: maintain `dot` as a Bun-built TypeScript binary where all behavior is modeled as Effect programs and services. Use dependency injection throughout. Reference the local Effect V4 checkout at `~/.local/share/repos/effect` whenever implementation details are unclear.

## References from Effect repo

- CLI API: `effect/unstable/cli`
  - Example: `~/.local/share/repos/effect/ai-docs/src/70_cli/10_basics.ts`
  - Real command module: `~/.local/share/repos/effect/packages/tools/bundle/src/Cli.ts`
- Bun platform layer: `@effect/platform-bun`
  - `BunServices.layer` provides FileSystem, Path, Terminal, Stdio, Crypto, ChildProcessSpawner.
  - `BunRuntime.runMain` runs the main Effect.
- Runtime dependencies should be official Effect packages, not vendored source.
- Service/layer style reference: `~/.local/share/repos/effect/packages/tools/bundle/src/Rollup.ts` uses `class Rollup extends Context.Service<Rollup>()(...)` plus `static readonly layer = Layer.effect(this, this.make)`.

## Package layout

Services should be named after stable capabilities, not current tools. Tool-specific integrations live next to the service definition. Start with a single service file for small services. When a service has multiple implementations or the file gets large, promote it to a folder: `index.ts` contains the public service definition and static layer exports, while sibling files contain implementation details. The static layers remain exposed from the service class/module as thin wrappers.

Examples:

- Small service: `services/BinaryLinker.ts`
- Multi-implementation service:
  - `services/SecretManager/index.ts` defines `SecretManager` and exposes `SecretManager.OnePassword`, `SecretManager.Test`, etc.
  - `services/SecretManager/OnePassword.ts` contains the implementation factory.
  - `services/SecretManager/Test.ts` contains test/fake helpers.

```txt
~/.dotfiles/
├── bin/
│   └── dot.ts                       # Bun shebang entry during development
├── src/dot/
│   ├── main.ts                      # Command.run + BunRuntime.runMain
│   ├── Cli.ts                       # root command + command tree
│   ├── Config.ts                    # Effect Config value for dotfiles paths/settings
│   ├── Runtime.ts                   # production Layer composition
│   ├── services/
│   │   ├── CommandExecutor/
│   │   │   ├── index.ts             # service + static layers
│   │   │   └── Bun.ts               # Bun child-process implementation
│   │   ├── FileVersioning/
│   │   │   ├── index.ts             # generic VCS service + static layers
│   │   │   ├── Git.ts
│   │   │   └── Jj.ts                # future
│   │   ├── PackageInstaller/
│   │   │   ├── index.ts             # generic package service + static layers
│   │   │   ├── Homebrew.ts
│   │   │   ├── Npm.ts
│   │   │   ├── Pnpm.ts
│   │   │   └── Bun.ts
│   │   ├── SecretManager/
│   │   │   ├── index.ts             # generic secret service + static layers
│   │   │   ├── OnePassword.ts
│   │   │   └── Test.ts
│   │   ├── ConfigLinker/
│   │   │   ├── index.ts             # generic linking service + static layers
│   │   │   └── Stow.ts
│   │   ├── BinaryLinker.ts         # small service can stay as one file
│   │   ├── ShellEnvironment.ts     # shell setup helpers
│   │   ├── AgentRuntime/
│   │   │   ├── index.ts             # generic agent service + static layers
│   │   │   └── Pi.ts
│   │   └── Workspace.ts             # dotfiles repo status and publishability checks
│   └── commands/
│       ├── doctor.ts
│       ├── init.ts
│       ├── update.ts
│       ├── link.ts
│       ├── stow.ts
│       ├── package.ts
│       └── secrets.ts
├── package.json
├── tsconfig.json
└── dist/
    └── dot                         # built during bootstrap; not committed
```

## Runtime / build

Use Bun as the binary runtime.

Development command:

```bash
bun run bin/dot.ts doctor
```

Build command options to validate:

```bash
bun build ./bin/dot.ts --compile --outfile ./dist/dot
```

or, if compile has dependency limitations:

```bash
bun build ./bin/dot.ts --target bun --outfile ./dist/dot.js
```

Then `dot link` should point `~/.local/bin/dot` to `dist/dot`. During early development only, a temporary shim may execute `bun run ~/.dotfiles/bin/dot.ts`, but the target state is always a bootstrap-built binary. `dist/dot` should not be committed.

## Dependencies

Initial package dependencies:

```jsonc
{
  "type": "module",
  "scripts": {
    "dot": "bun run bin/dot.ts",
    "check": "bun run check:types && bun run check:lint",
    "check:types": "tsc --noEmit",
    "check:lint": "ultracite check",
    "build": "bun build ./bin/dot.ts --compile --outfile ./dist/dot",
  },
  "dependencies": {
    "effect": "4.0.0-beta.78",
    "@effect/platform-bun": "4.0.0-beta.78",
  },
  "devDependencies": {
    "@types/bun": "1.3.14",
    "typescript": "6.0.3",
    "ultracite": "7.8.1",
  },
}
```

Pin versions via `bun.lock`.

## Effect command tree

Use `Command.make`, `Command.withSubcommands`, `Flag`, and `Argument` from `effect/unstable/cli`.

```txt
dot
├── doctor
├── init
├── update
├── apply (alias: stow)
├── unapply (alias: unstow)
├── link
├── unlink
├── completions
│   └── add <COMMAND_NAME> [--shell zsh] [--no-apply]
├── package
│   ├── list
│   ├── add <name>
│   ├── remove <name>
│   └── update [name]
└── secrets
    ├── doctor
    ├── render
    ├── add <ENV_NAME> [--value-stdin]
    └── remove <ENV_NAME>
```

Aliases:

- `secret` -> `secrets`
- `rm` / `delete` -> `remove`

## Dependency injection model

Everything should be called through services, not raw global functions inside handlers. Public services should model stable capabilities; implementation layers choose the concrete tool. This keeps the CLI portable across macOS/Linux and replaceable across tools.

Use the Effect V4 static service/layer pattern used in the Effect repo, for example `packages/tools/bundle/src/Rollup.ts`:

```ts
export class PackageInstaller extends Context.Service<PackageInstaller>()(
  "dot/PackageInstaller",
  {
    make: Effect.gen(function* () {
      // yield platform/generic dependencies here
      return {
        install: Effect.fn("PackageInstaller.install")(function* (
          request: InstallRequest
        ) {
          // implementation
        }),
      } as const;
    }),
  }
) {
  static readonly layer = Layer.effect(this, this.make);
}
```

For implementation-specific layers, the public service remains generic and imports implementation factories as thin wrappers:

```ts
// services/SecretManager/index.ts
import { makeOnePasswordSecretManager } from "./OnePassword.ts"
import { makeTestSecretManager } from "./Test.ts"

export class SecretManager extends Context.Service<SecretManager>()("dot/SecretManager", { ... }) {
  static readonly OnePassword: Layer.Layer<SecretManager, SecretManagerError, CommandExecutor | DotfilesConfig> =
    Layer.effect(this, makeOnePasswordSecretManager)

  static readonly Test = (impl: SecretManager): Layer.Layer<SecretManager> =>
    Layer.succeed(this, makeTestSecretManager(impl))
}
```

Implementation files should not define competing public service tags. They export factories/layers consumed by `index.ts`.

Production runtime chooses implementations through layer composition/config:

```ts
export const Live = BunServices.layer.pipe(
  Layer.provideMerge(CommandExecutor.Bun),
  Layer.provideMerge(FileVersioning.Git),
  Layer.provideMerge(PackageInstaller.Homebrew),
  Layer.provideMerge(SecretManager.OnePassword),
  Layer.provideMerge(ConfigLinker.Stow),
  Layer.provideMerge(AgentRuntime.Pi)
);
```

### `DotfilesConfig`

`DotfilesConfig` is intentionally **not** a `Context.Service`. It is a plain Effect `Config` value composed with `Config.all` and `Config.map`, so it uses Effect's standard config provider machinery (environment loading, schema/config composition, defaults, and future redacted values).

Current environment keys:

- `DOTFILES_DIR` — defaults to `${homedir()}/.dotfiles`
- `HOME` — defaults to Node's `homedir()`
- `DOTFILES_SECRETS_VAULT` — defaults to `Personal`

Derived values:

- `brewfilePath`
- `secretsTemplatePath`
- `secretsOutputPath`
- `localBinDotPath`

Future implementation choices should also be modeled as `Config` values first (for example package installer, secret manager, config linker), then used by runtime layer composition. Do not reintroduce a config service unless we need mutable runtime state.

### `CommandExecutor`

Single wrapper around child processes using Effect process APIs from Bun platform.

Methods:

- `run(command, args, options)` -> structured exit/stdout/stderr
- `runText(...)` -> stdout as string or typed failure
- `exists(command)` -> boolean

This gives us one place for logging, redaction, timeouts, and tests.

### `SecretManager`

Generic secret storage and template-rendering capability. OnePassword is only the first implementation.

Methods:

- `isInstalled`
- `isSignedIn`
- `accountList`
- `inject(templatePath, outputPath)`
- `itemExists(title, vault)`
- `createPasswordItem(title, value, vault)`
- `updatePasswordItem(title, value, vault)`
- `archiveItem(title, vault)`
- `readReference(ref)` for diagnostics only when needed

Inline layers:

- `SecretManager.OnePassword` wraps the `op` CLI.
- Future: `SecretManager.LastPass`, `SecretManager.Pass`, `SecretManager.Environment`, etc.

The service must never log secret values.

### `Secrets`

High-level domain service built on `SecretManager` + FileSystem + template editor.

Methods:

- `doctor`
- `render`
- `add(name, valueSource)`
- `remove(name)`
- `listReferences`
- `validateEnvName`

Rules:

- Secret names must match `^[A-Z_][A-Z0-9_]*$`.
- 1Password item title is `Dotfiles ${ENV_NAME}` by default.
- Reference is `op://<vault>/Dotfiles <ENV_NAME>/password` for the OnePassword implementation.
- `add` creates/updates the backing secret item, updates template, renders output.
- `remove` removes template line, archives/removes the backing item, renders output.
- `dot secrets add NAME` prompts interactively.
- `dot secrets add NAME --value-stdin` reads the secret value from stdin for non-interactive contexts.
- `dot secrets add NAME value` is intentionally unsupported to avoid shell-history/process-list leaks.
- Prompting/stdin should use a dedicated `SecretValueInput` service so tests can inject values.

### `Workspace`

Generic dotfiles workspace/repo status capability.

Methods:

- `status`
- `ensureLocation`
- `secretValueScan`

### `FileVersioning`

Generic VCS capability.

Methods:

- `status`
- `pullFastForward`
- `currentBranch`
- `remoteSummary`

Inline layers:

- `FileVersioning.Git`
- Future: `FileVersioning.Jj`

### `BinaryLinker`

Methods:

- `linkDot`
- `unlinkDot`
- `currentDotResolution`
- `pathContainsLocalBin`

### `PackageInstaller`

Generic package-management capability. Commands choose implementation via flags/config, not by calling Homebrew directly.

Methods:

- `isInstalled`
- `installSelfIfMissing`
- `installPackage(request)`
- `removePackage(request)`
- `updatePackage(request)`
- `updateAll`
- `listManifest`
- `applyManifest`

Package commands should accept an installer selector, for example:

```bash
dot package add ripgrep                         # default installer from config: homebrew
dot package add typescript --installer npm
dot package add prettier --installer pnpm
dot package add bun-types --installer bun
dot package add pacman-only-tool --installer pacman
```

Inline layers:

- `PackageInstaller.Homebrew`
- `PackageInstaller.Npm`
- `PackageInstaller.Pnpm`
- `PackageInstaller.Bun`
- Future: `PackageInstaller.Pacman`

### `ConfigLinker`

Generic config-linking capability.

Methods:

- `linkHome`
- `unlinkHome`
- `doctorLinks`

Inline layers:

- `ConfigLinker.Stow`
- Future: `ConfigLinker.NativeSymlink`, `ConfigLinker.Chezmoi`, etc.

### `AgentRuntime`

Generic agent runtime capability; Pi is the first implementation.

Methods:

- `isInstalled`
- `update`
- `doctorConfig`
- `installPackage`
- future: vendor extension operations

Inline layers:

- `AgentRuntime.Pi`
- Future: other agent runtimes if needed.

## Error model

Use tagged errors instead of throwing strings.

Examples:

```ts
class MissingCommandError extends Data.TaggedError("MissingCommandError")<{
  readonly command: string;
}> {}

class SecretManagerError extends Data.TaggedError("SecretManagerError")<{
  readonly provider: string;
  readonly operation: string;
  readonly reason: string;
}> {}

class SecretNameError extends Data.TaggedError("SecretNameError")<{
  readonly name: string;
}> {}
```

CLI handlers should map domain errors to useful messages and exit non-zero.

## Effect style rules

- Command handlers return `Effect.Effect<void, E, R>`.
- No direct `fs`, `process.env`, or `console.log` in domain code. Use Effect `Config` for configuration; shell/process execution belongs behind services.
- Use services from context (`yield* Service`) and platform services (`FileSystem`, `Path`, `Terminal`, `Stdio`).
- Use `Layer` composition for production runtime.
- Use test layers for CLI/domain tests.
- Redact secrets at the type boundary where possible.
- Shelling out is allowed only via `CommandRunner` service.

## Initial implementation phases

### Phase 1 — TypeScript/Bun skeleton

- [x] Add `package.json`, `tsconfig.json`, `bin/dot.ts`, `src/dot/main.ts`.
- [x] Wire `Command.run(cli, { version })` with `BunServices.layer` and `BunRuntime.runMain`.
- [x] Implement `doctor`, `link`, and `secrets doctor/render/add/remove` first.
- [x] Remove the old Bash `dot` fallback.

### Phase 2 — Service extraction

- [x] Replace `DotfilesConfig.Live` with a plain Effect `Config` value.
- [x] Implement `CommandExecutor.Bun` in `services/CommandExecutor/Bun.ts`, exposed from `services/CommandExecutor/index.ts`.
- [x] Implement `SecretManager.OnePassword` in `services/SecretManager/OnePassword.ts`, exposed from `services/SecretManager/index.ts` behind generic `SecretManager`.
- [x] Implement `Secrets.Live` against generic `SecretManager`.
- [x] Port current Bash secrets behavior, except deliberately remove `dot secrets add NAME value` and replace it with prompt / `--value-stdin`.

### Phase 3 — Replace shell CLI

- [ ] Build Bun binary during bootstrap.
- [x] Change `~/.local/bin/dot` to point to built binary.
- [x] Remove Bash CLI fallback.
- [x] Update docs to present TypeScript CLI as canonical.

### Phase 4 — Expand CLI

- [ ] Port `doctor` fully.
- [ ] Port `stow`/`unstow`.
- [ ] Port `init`/`update`.
- [ ] Port package helpers.
- [ ] Add vendored Pi-extension management commands.

## Decisions from review

- `dot secrets add NAME value` will **not** be supported in the Effect CLI. Use interactive prompting by default, or `--value-stdin` for non-interactive contexts.
- Secret item titles should use raw env names: `Dotfiles SOME_API_KEY`.
- `dist/dot` should always be built during bootstrap and should not be committed.
- The Bash CLI has been removed; the Bun + Effect CLI is canonical.
- Public services should be capability-oriented and implementation-neutral.
- Service organization rule: single file for small services; folder with `index.ts` for the service definition plus sibling implementation files when there are multiple implementations or the file grows. Static layer names are still exposed from the service class/module:
  - `FileVersioning`, not `Git`
  - `PackageInstaller`, not `Homebrew`
  - `SecretManager`, not `OnePassword`
  - `ConfigLinker`, not `Stow`
  - `AgentRuntime`, not `Pi`
