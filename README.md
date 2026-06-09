# dotfiles

Personal development environment and Pi setup.

The repo lives at `~/.dotfiles` and publishes to `https://github.com/utopyin/.dotfiles`.

## Public-safety boundary

Tracked files should contain reproducible configuration only. Tokens, auth files,
MCP OAuth/session state, generated secret files, local caches, and app export
bundles stay ignored or untracked. Secret templates use 1Password references,
not secret values.

## Current migration status

See [`docs/SETUP_TODO.md`](docs/SETUP_TODO.md).

## Bootstrap

Clone the repo, install dependencies, build the local `dot` binary, then link it
into `~/.local/bin`:

```bash
git clone https://github.com/utopyin/.dotfiles ~/.dotfiles
cd ~/.dotfiles
bun install
bun run build
bun run dot link
dot doctor
```

Apply the tracked home-directory configuration with Stow:

```bash
dot apply
```

Render local secrets only after signing in to 1Password CLI:

```bash
op signin
dot secrets doctor
dot secrets render
```

For a first-pass full bootstrap on a machine with Bun available, `init` installs packages, builds `dist/dot`, links `~/.local/bin/dot`, applies config, and checks the result:

```bash
bun run dot init
```

## Usage

The canonical CLI is Bun + Effect V4.

```bash
bun run dot doctor  # inspect current setup
bun run build               # build dist/dot, not committed
bun run dot link            # install ~/.local/bin/dot -> ~/.dotfiles/dist/dot
bun run dot link --dev      # install a shim that runs bin/dot.ts via Bun
```

### Cursor profile

`cursor-profile.code-profile` is sanitized for publishing: it keeps settings,
keybindings, and extension IDs, but excludes Cursor `globalState`, account data,
local file history, and absolute project paths.

Sync it from a Cursor user data profile with:

```bash
bun run dot cursor sync                 # uses saved profile name, or sole profile
bun run dot cursor sync cursor-profile  # explicit Cursor profile name or id
```

Apply it to Cursor through the normal config apply flow:

```bash
bun run dot apply                         # asks whether to apply Cursor too
bun run dot apply --cursor                # apply Cursor without prompting
bun run dot apply --cursor --no-cursor-extensions
bun run dot apply --yes                   # accept defaults; does not apply Cursor
```
