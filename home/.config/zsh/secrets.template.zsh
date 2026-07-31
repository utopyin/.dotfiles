# 1Password-backed shell secrets template.
#
# This file is safe to commit because it contains only 1Password secret references, not values.
# Render it with:
#   ~/.dotfiles/dot secrets render
#
# Expected 1Password locations. These are Password-category items in the Personal vault.

export GITHUB_TOKEN="op://Personal/Dotfiles GitHub Token/password"
export GEMINI_API_KEY="op://Personal/Dotfiles Gemini API Key/password"
export CEREBRAS_API_KEY="op://Personal/Dotfiles Cerebras API Key/password"
export CLOUDFLARE_API_TOKEN="op://Personal/Dotfiles Cloudflare API Token/password"
export UIDOTSH_TOKEN="op://Personal/Dotfiles UIDOTSH Token/password"
export UIDOTSH_BEARER="Bearer ${UIDOTSH_TOKEN}"
export EXCALIDRAW_API_KEY="op://Personal/Dotfiles Excalidraw API Key/password"
export GH_REGISTRY_TOKEN="op://Personal/Dotfiles GH Registry Token/password"
export FIREWORKS_API_KEY="op://Personal/Dotfiles Fireworks API Token/password"
