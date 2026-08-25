# Linux and Omarchy support

The `dot` runtime detects macOS or Linux once and selects native Effect service
implementations. macOS uses Homebrew. Omarchy uses its package helpers, backed
by Pacman and the AUR. Other Linux distributions currently fail with a typed
unsupported-platform error instead of guessing a package manager.

## Bootstrap

After cloning this repository to `~/.dotfiles`, run:

```sh
./bin/bootstrap
```

The bootstrap script only resolves the Git/Bun dependency cycle. All machine
configuration remains in the Effect CLI.

## Package manifests

- `packages/Brewfile` is the macOS manifest.
- `packages/arch.repo` contains official Arch repository packages.
- `packages/arch.aur` contains AUR packages.
- `packages/arch.remove` contains installed packages that must be removed before
  desired replacements are reconciled.

Blank lines and lines beginning with `#` are ignored. Package reconciliation is
idempotent. Apps with no Linux equivalent remain macOS-only until an explicit
replacement is chosen; authentication, licenses, sessions, and secrets are not
synced.

## Platform-specific configuration

Portable configuration stays under `home/common/`. Platform-specific files live
under `home/macos/` and `home/linux/`. Small external-tool differences,
such as Homebrew paths, OrbStack, and the 1Password SSH signer location, are
isolated in the relevant shell or tool integration file.

The macOS layer owns Duti, Karabiner, and the tracked Ghostty profile.

The current Linux layer tracks deliberate Omarchy overrides for Hyprland
bindings, input, and monitor scaling; SF Pro Text for the system sans-serif UI
font; Geist Mono across Alacritty, Foot, Kitty, and Ghostty; and the machine's
Mise tool declarations.
Stock Omarchy shell, Starship, and tmux files are not copied into the repository.

Espanso's configuration and sanitized Raycast snippet import are tracked under
`home/linux/.config/espanso/`. Personal and machine-specific values are read
from environment variables, with an optional ignored fallback file at
`~/.config/espanso/secrets.local.env`. Copy `secrets.example.env` to that path,
fill in the values, and keep its permissions at `600`.
