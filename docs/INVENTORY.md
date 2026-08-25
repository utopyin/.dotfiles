# Machine inventory

Public-safe inventory captured during the dotfiles migration. Secret values,
authentication material, local session state, and machine-specific cache files are
not included.

## Shell

- Shell config: `home/common/.zshrc`
- Prompt config: `home/common/.p10k.zsh`
- Split zsh snippets: `home/common/.config/zsh/conf.d/*.zsh`
- Oh My Zsh custom plugins present on this machine:
  - `zsh-autosuggestions`
  - `zsh-syntax-highlighting`
- Powerlevel10k is installed as an Oh My Zsh custom theme.
- PATH additions are kept home-relative where possible.
- Secret exports are delegated to the generated, ignored `~/.config/secrets/env.zsh`.

## Agent skills

Local user skills are public and tracked under `home/common/.agents/skills` so a fresh
machine gets the same skill library through the stow layout.

## Pi

Tracked sanitized Pi config:

- `home/common/.pi/agent/settings.json`
- `home/common/.pi/agent/mcp.json`
- `home/common/.pi/agent/keybindings.json`
- `home/common/.pi/agent/themes/current-ide.json`
- `home/common/.pi/agent/npm/package.json`
- `home/common/.pi/agent/npm/package-lock.json`
- `home/common/.pi/agent/extensions/**` for reviewed, approved, public-safe local extensions.
- extension-local `package.json` / `package-lock.json` only when an extension needs npm dependencies.

See `docs/PI_EXTENSIONS.md` for extension provenance.

Ignored Pi state/auth/cache:

- `home/common/.pi/agent/auth.json`
- `home/common/.pi/agent/mcp-cache.json`
- `home/common/.pi/agent/mcp-npx-cache.json`
- `home/common/.pi/agent/mcp-oauth/**`
- `home/common/.pi/agent/sessions/**`
- `home/common/.pi/agent/extensions/**/node_modules/**`
- `home/common/.pi/agent/npm/node_modules/**`

Installed Pi package and extension-local dependencies are represented by tracked npm manifests and lockfiles.

## Apps and tools

- Homebrew package manifest: `packages/Brewfile`
- Git config: `home/common/.config/git/config`
- Global Git ignore: `home/.gitignore_global`
- Ghostty config: `home/macos/.config/ghostty/config`
- Ghostty theme/shaders used by the config are tracked under `home/macos/.config/ghostty/`.

Global tools observed on this machine include Pi, Hitch, npm/yarn/corepack, and
project CLIs such as Codex, Bruno, Netlify, Vercel, Wrangler, Oxlint/Oxfmt, and
Biome. They are not all promoted into the Homebrew manifest; package-manager
manifests remain the source of truth for bootstrap.

## Secrets

- Inline shell tokens/API keys were removed from tracked config.
- Committed templates contain 1Password references only.
- Rendered secret files and Pi/MCP auth/session material stay ignored.
- Any tokens that were previously exposed in shell config/history should be rotated manually.
