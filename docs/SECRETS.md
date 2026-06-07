# Secrets

Secrets are managed by 1Password and rendered into an ignored local shell file.

## Files

- Committed template: `home/.config/zsh/secrets.template.zsh`
- Ignored rendered file: `~/.config/secrets/env.zsh`

## 1Password items

The rotation review candidate list from the old shell-config migration is:

- `GITHUB_TOKEN`
- `GEMINI_API_KEY`
- `CEREBRAS_API_KEY`
- `CLOUDFLARE_API_TOKEN`
- `UIDOTSH_TOKEN`
- `EXCALIDRAW_API_KEY`

`UIDOTSH_BEARER` is derived from `UIDOTSH_TOKEN`, not a separate secret value.

The template references Password-category items in the `Personal` vault:

- `Dotfiles GitHub Token` → `password`
- `Dotfiles Gemini API Key` → `password`
- `Dotfiles Cerebras API Key` → `password`
- `Dotfiles Cloudflare API Token` → `password`
- `Dotfiles UIDOTSH Token` → `password`
- `Dotfiles Excalidraw API Key` → `password`

## Commands

```bash
op signin
~/.dotfiles/dot secrets doctor
~/.dotfiles/dot secrets render
```

`dot secrets render` uses `op inject` and writes `~/.config/secrets/env.zsh` with mode `600`.

## Add a secret

Preferred form prompts without echoing the value:

```bash
~/.dotfiles/dot secrets add SOME_API_KEY
```

Non-interactive form reads from stdin:

```bash
printf %s "$SECRET_VALUE" | ~/.dotfiles/dot secrets add SOME_API_KEY --value-stdin
```

`dot secrets add SOME_API_KEY value` is intentionally unsupported in the Effect CLI because it can leak into shell history/process logs.

This creates/updates a 1Password item named `Dotfiles SOME_API_KEY`, updates `secrets.template.zsh`, and re-renders `~/.config/secrets/env.zsh`.

## Remove a secret

```bash
~/.dotfiles/dot secrets remove SOME_API_KEY
```

This removes the export from `secrets.template.zsh`, archives the 1Password item named `Dotfiles SOME_API_KEY`, and re-renders `~/.config/secrets/env.zsh`.

`dot secret ...` is also supported as an alias for `dot secrets ...`.

Never commit the rendered file or raw secret values.
