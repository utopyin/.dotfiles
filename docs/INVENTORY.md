# Machine inventory

Public-safe inventory captured during the dotfiles migration. Secret values,
authentication material, local session state, and machine-specific cache files are
not included.

## Shell

- Shell config: `home/.zshrc`
- Prompt config: `home/.p10k.zsh`
- Split zsh snippets: `home/.config/zsh/conf.d/*.zsh`
- Oh My Zsh custom plugins present on this machine:
  - `zsh-autosuggestions`
  - `zsh-syntax-highlighting`
- Powerlevel10k is installed as an Oh My Zsh custom theme.
- PATH additions are kept home-relative where possible.
- Secret exports are delegated to the generated, ignored `~/.config/secrets/env.zsh`.

## Agent skills

Local user skills are public and tracked under `home/.agents/skills` so a fresh
machine gets the same skill library through the stow layout.

## Pi

Tracked sanitized Pi config:

- `home/.pi/agent/settings.json`
- `home/.pi/agent/mcp.json`
- `home/.pi/agent/keybindings.json`
- `home/.pi/agent/themes/current-ide.json`
- `home/.pi/agent/npm/package.json`
- `home/.pi/agent/npm/package-lock.json`
- `home/.pi/agent/extensions/**` for reviewed, approved, public-safe local extensions.
- extension-local `package.json` and `package-lock.json` files for extensions that need npm dependencies.

See `docs/PI_EXTENSIONS.md` for extension provenance.

Ignored Pi state/auth/cache:

- `home/.pi/agent/auth.json`
- `home/.pi/agent/mcp-cache.json`
- `home/.pi/agent/mcp-npx-cache.json`
- `home/.pi/agent/mcp-oauth/**`
- `home/.pi/agent/sessions/**`
- `home/.pi/agent/extensions/**/node_modules/**`
- `home/.pi/agent/npm/node_modules/**`

Installed Pi package and extension-local dependencies are represented by the tracked npm manifests and lockfiles.

## Apps and tools

- Homebrew package manifest: `packages/Brewfile`
- Git config: `home/.config/git/config`
- Global Git ignore: `home/.gitignore_global`
- Ghostty config: `home/.config/ghostty/config`
- Ghostty theme/shaders used by the config are tracked under `home/.config/ghostty/`.

Global tools observed on this machine include Pi, Hitch, npm/yarn/corepack, and
project CLIs such as Codex, Bruno, Netlify, Vercel, Wrangler, Oxlint/Oxfmt, and
Biome. They are not all promoted into the Homebrew manifest; package-manager
manifests remain the source of truth for bootstrap.

## Secrets

- Inline shell tokens/API keys were removed from tracked config.
- Committed templates contain 1Password references only.
- Rendered secret files and Pi/MCP auth/session material stay ignored.
- Any tokens that were previously exposed in shell config/history should be rotated manually.
