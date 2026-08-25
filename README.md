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

For a first-pass full bootstrap on a machine with Bun available, authenticate GitHub first. `init` installs packages, derives the Git name and email from the authenticated GitHub account, writes them to the ignored `~/.config/git/identity.config`, builds `dist/dot`, links `~/.local/bin/dot`, applies config, and checks the result. When GitHub has no public email, `init` uses the account's GitHub noreply address.

```bash
gh auth login
bun run dot init
```

Git commit signing uses the first key exposed by the 1Password SSH agent. The tracked Git config enables SSH signing without committing the public key or personal identity. HTTPS pushes use the authenticated GitHub CLI credential helper, and the first push of a local branch automatically sets its upstream.

## Usage

The canonical CLI is Bun + Effect V4.

```bash
bun run dot doctor  # inspect current setup
bun run build               # build dist/dot, not committed
bun run dot link            # install ~/.local/bin/dot -> ~/.dotfiles/dist/dot
bun run dot link --dev      # install a shim that runs bin/dot.ts via Bun
```

### Default developer file app

On macOS, apply the tracked developer-file associations for Zed Preview with:

```bash
duti ~/.duti
```

The settings cover source code, scripts, plain text, documentation, data, and
common project/configuration formats.

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
