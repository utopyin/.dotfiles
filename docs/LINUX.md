# Linux support: Omarchy and Ubuntu

The `dot` runtime resolves one of three environments once, `macos`, `omarchy`,
or `ubuntu`, and selects native Effect service implementations from it. macOS
uses Homebrew. Omarchy uses its package helpers, backed by Pacman and the AUR.
Ubuntu, and derivatives whose `ID_LIKE` includes `ubuntu`, uses APT. Other Linux
distributions fail with a typed unsupported-platform error instead of guessing a
package manager.

## Bootstrap

After cloning this repository to `~/.dotfiles`, run:

```sh
./bin/bootstrap
```

The bootstrap script only resolves the Git/Bun dependency cycle. On Ubuntu it
also installs mise with the official installer, because APT has no mise package
and `dot init` needs it on `PATH`. All machine configuration remains in the
Effect CLI.

## Package manifests

- `packages/Brewfile` is the macOS manifest.
- `packages/arch.repo` contains official Arch repository packages.
- `packages/arch.aur` contains AUR packages.
- `packages/arch.remove` contains installed packages that must be removed before
  desired replacements are reconciled.
- `packages/ubuntu.apt` contains Ubuntu APT packages.

Blank lines and lines beginning with `#` are ignored. Package reconciliation is
idempotent. Apps with no Linux equivalent remain macOS-only until an explicit
replacement is chosen; authentication, licenses, sessions, and secrets are not
synced.

## Platform-specific configuration

Portable configuration stays under `home/common/`. Environment-specific files live
under `home/macos/`, `home/omarchy/`, and `home/ubuntu/`. Small external-tool differences,
such as Homebrew paths, OrbStack, and the 1Password SSH signer location, are
isolated in the relevant shell or tool integration file.

The macOS layer owns Duti, Karabiner, and the tracked Ghostty profile.

The Omarchy layer tracks deliberate overrides for Hyprland
bindings, input, and monitor scaling; SF Pro Text for the system sans-serif UI
font; Geist Mono across Alacritty, Foot, Kitty, and Ghostty; and the machine's
Mise tool declarations.
Stock Omarchy shell, Starship, and tmux files are not copied into the repository.

Espanso's configuration and sanitized Raycast snippet import are tracked under
`home/omarchy/.config/espanso/`. Personal and machine-specific values are read
from environment variables, with an optional ignored fallback file at
`~/.config/espanso/secrets.local.env`. Copy `secrets.example.env` to that path,
fill in the values, and keep its permissions at `600`.

## Ubuntu

The Ubuntu layer targets minimal devboxes: the full command-line toolset with
no desktop configuration. `home/ubuntu/` tracks the Mise tool declarations and a
small zsh integration file.

APT installs only the base system packages: compilers, git, zsh, stow, tmux, and
similar. Every other developer tool in the macOS Brewfile comes from Mise, which
ships current versions where APT is missing or outdated. That covers Neovim,
lazygit, `gh`, `fd`, `fzf`, `delta`, zoxide, k9s, the cloud CLIs, Rust, Zig, and
the 1Password CLI (`op`).

Mise-installed tools such as `op` and `gh` resolve everywhere. Interactive zsh
uses `mise activate`. `dot` appends `~/.local/bin` and the Mise shims directory
to the `PATH` of every command it runs, whatever shell started it. `~/.zshenv`
adds the shims for scripts and `ssh host command`.

When GitHub CLI is not authenticated, `dot init` runs `gh auth login` itself
with the terminal attached, then continues. Without a terminal it stops with
the usual hint instead.

APT runs through `sudo` in a terminal, through `pkexec` without one, and
directly when `dot` runs as root. `dot init` leaves the login shell alone; run
`chsh -s "$(command -v zsh)"` once on a new devbox.
