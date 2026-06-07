# Dotfiles + Pi Setup TODO

Goal: turn this machine’s live setup into a reproducible, publishable dotfiles repo at `~/.dotfiles`, with a `dot` CLI, locally vendored Pi extensions where useful, and secrets moved out of shell config into 1Password.

## Decisions already made

- [x] Primary dotfiles repo should live at `~/.dotfiles`.
- [x] Old dev-folder repo location is no longer needed; `~/.dotfiles` is canonical.
- [x] Vendor most non-official Pi runtime dependencies/extensions as source in dotfiles.
- [x] Do **not** vendor official Pi SDK/runtime packages such as `@earendil-works/pi-*` / Pi TUI / Pi coding agent packages.
- [x] Keep official runtime dependencies pinned in lockfiles instead.

## Phase 0 — Repo hygiene

- [x] Replace old remote `https://github.com/utopyin/config` with `https://github.com/utopyin/.dotfiles`.
- [x] Decide whether to rename GitHub repo from `config` to `.dotfiles`.
- [x] Add/verify `.gitignore` rules for secrets, caches, auth, sessions, node_modules, local state.
- [x] Ensure no secret values are committed before next push.
- [x] Decide public vs private boundaries:
  - [x] Public: sanitized shell config, sanitized Cursor profile, Pi extensions, skills, themes, dot CLI, package manifests.
  - [x] Private/ignored: tokens, auth files, MCP OAuth tokens, session logs, machine-specific caches, generated secret files, app export bundles such as Raycast `.rayconfig` files.

## Phase 1 — Inventory current machine

- [x] Inventory shell setup:
  - [x] `~/.zshrc`
  - [x] `~/.p10k.zsh`
  - [x] Oh My Zsh plugins
  - [x] aliases/functions/PATH entries
- [x] Inventory Pi setup:
  - [x] `~/.pi/agent/settings.json`
  - [x] `~/.pi/agent/mcp.json`
  - [x] installed Pi packages
  - [x] local skills under `~/.agents/skills`
  - [x] pi-lens skills/extensions from npm
- [x] Inventory apps/tools:
  - [x] Homebrew formulae
  - [x] Homebrew casks
  - [x] npm/pnpm/bun global tools
  - [x] Ghostty/Git config
- [x] Identify secrets currently embedded in shell/config files.

## Phase 2 — Convert repo to stow layout

- [x] Move tracked dotfiles into `home/`:
  - [x] `.zshrc` -> `home/.zshrc` sanitized from live config
  - [x] `.p10k.zsh` -> `home/.p10k.zsh`
  - [x] current Git config -> `home/.config/git/config`
  - [x] current Ghostty config -> `home/.config/ghostty/config`
  - [x] Pi config -> `home/.pi/...`
- [x] Keep package manifests in `packages/`:
  - [x] `Brewfile` -> `packages/Brewfile`
- [x] Add GNU Stow commands via `dot stow`.
- [x] Make stow idempotent and safe with backups.

## Phase 3 — Build your `dot` CLI

See `docs/EFFECT_CLI_PLAN.md`. The canonical CLI is Bun + Effect V4, using `effect/unstable/cli`, `@effect/platform-bun`, Effect `Config` for configuration loading/composition, and dependency-injected capability services.

- [x] Add Bun + Effect V4 TypeScript CLI skeleton.
- [x] Port secrets commands to Effect services.
- [x] Port first-pass doctor/link/apply/update/init/package list/completions to Effect services.
- [x] Replace the custom config service with a plain Effect `Config` value.
- [x] Implement `dot init`:
  - [x] install/check Homebrew
  - [x] install packages from Brewfile(s)
  - [x] install/check Oh My Zsh + plugins + Powerlevel10k
  - [x] stow configs
  - [x] install Pi if missing
  - [x] install Pi package deps
  - [x] setup shell integrations
- [x] Implement first-pass `dot update`:
  - [x] pull latest dotfiles
  - [x] brew update/upgrade/bundle
  - [x] restow
  - [x] update Pi/packages
- [x] Implement first-pass `dot doctor`:
  - [x] check symlinks
  - [x] check Homebrew packages
  - [x] check shell config
  - [x] check Pi config
  - [x] check required 1Password items exist
- [x] Implement `dot stow` / `dot unstow`.
- [x] Implement `dot package add/remove/update`.
- [x] Implement `dot package list`.
- [x] Implement `dot edit`.
- [x] Implement sanitized Cursor profile sync/apply flow (`dot cursor sync`, interactive `dot apply`, or `dot apply --cursor`).
- [x] Implement generic zsh completion installer (`dot completions add <command>` reads stdin).

## Phase 4 — Move secrets to 1Password

- [x] Remove inline tokens/API keys from tracked `home/.zshrc`.
- [x] Create ignored generated shell file, e.g. `~/.config/secrets/env.zsh`.
- [x] Use `op inject` template rendering for secret loading.
- [x] Add `dot secrets doctor` to verify required items exist.
- [x] Add `dot secrets render` helper.
- [x] Ensure committed configs only reference secret names/1Password refs, never values.
- [x] Rotate any tokens that were exposed in shell config/history if needed.

## Phase 5 — Vendor desired Pi extensions

### Vendor from Davis

- [ ] `/yeet` command.
- [ ] `openai-codex-fast-mode` exactly: inject `service_tier: "priority"` for OpenAI Codex responses.
- [ ] `zsh-user-bash` if current Pi setup does not already cover this cleanly.
- [ ] Firecrawl `search` / `scrape` tools.
- [ ] Evaluate Davis `pi-mcp` and likely vendor it instead of npm `pi-mcp-adapter`.
- [ ] Consider adding:
  - [ ] `/diff`
  - [ ] `/usage`
  - [ ] git status widget

### Vendor from dmmulroy

- [ ] `git-interceptor`:
  - [ ] set `GIT_EDITOR=true`
  - [ ] set `GIT_SEQUENCE_EDITOR=true`
  - [ ] set `GIT_MERGE_AUTOEDIT=no`
  - [ ] block `--no-verify`
- [ ] `whimsical` integration.
- [ ] `pi-cloak` secret masking.
- [ ] `pi-skill-toggle`.
- [ ] `todos` file-based todo management.
- [ ] Evaluate dmmulroy `web-tools` vs Davis Firecrawl.

## Phase 6 — Web tools decision

- [x] Compare Davis Firecrawl:
  - [x] Pros: clean search/scrape API, simple, good page extraction.
  - [x] Cons: paid/API-key dependency, external SaaS.
- [x] Compare dmmulroy web-tools:
  - [x] Pros: broader local extension architecture, webfetch/websearch, more controllable.
  - [x] Cons: more code to maintain; provider/API dependency still likely.
- [x] Recommendation to validate: use dmmulroy-style `web-tools` as primary `webfetch/websearch`; defer Firecrawl unless high-quality SaaS scraping becomes worth the extra API key.

## Phase 7 — Supply-chain / vendoring policy

- [x] Dylan vendors his own custom Pi source in dotfiles, but still uses npm packages for Pi SDK/dependencies.
- [x] Our policy: vendor non-official/custom Pi extensions; pin official runtime packages.
- [x] Pin all package versions in lockfiles.
- [x] Add dependency provenance notes for vendored code.
- [x] Add update script/checklist for refreshing vendored code from upstream.
- [x] Add `dot pi add <owner/repo|git-url>`:
  - [x] download/fork the extension locally
  - [x] run a Pi cleanup/conversion pass over the repo
  - [x] adapt it to dotfiles dev tools and conventions
  - [x] add the local extension to Pi config
- [x] Add `npm audit`/lockfile review to `dot doctor` or CI.

## Phase 8 — Test and publish

- [x] Run `dot doctor` on current machine.
- [x] Test stow/unstow idempotency.
- [x] Test Pi starts with vendored extensions.
- [x] Test secret loading via 1Password.
- [x] Push sanitized dotfiles.
  - [x] Push as a fresh public root commit or filtered history; do not push the old `config` history as-is because it contains retired app-export/local-path blobs.
- [x] Document bootstrap instructions in README.

## Immediate next step

- [x] Add `.gitignore`, repo README/AGENTS, and initial `dot` CLI skeleton.
- [x] Sign in to 1Password CLI and create/update the referenced secret items.
- [x] Run `dot secrets render` once references resolve.
- [x] Sanitize `cursor-profile.code-profile` and remove Cursor `globalState` from tracking.
- [x] Create public remote `utopyin/.dotfiles` and point `origin` at it.
- [x] Verify current tracked tree has no binary files, absolute user-home paths, Cursor account/global state, or common secret/token patterns.
- [x] Commit current tree as a fresh public-safe root (or filter history) before pushing.
