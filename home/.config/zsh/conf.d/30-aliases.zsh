bun-reset() {
  find . -name "node_modules" -type d -prune -exec rm -rf '{}' + -o -name "bun.lock" -type f -delete
}

lazygit() {
  command lazygit --use-config-file="$HOME/.config/lazygit/config.yml" "$@"
}
alias lz="lazygit"
alias gw="git worktree"
alias ghv="gh repo view -w"
alias b="bun"
alias bcd="find . \( -name node_modules -o -name .next -o -name .turbo \) -type d -prune -exec trash {} +"
alias clean-alchemy="find . -name .alchemy -type d -prune -exec trash {} +"
alias bi="bun install"
alias br="bun run"
alias bd="bun run dev || bun run d dev"
alias bl="bun run lint"
alias bct="bun run check:types || bun run type-check"
alias c="cursor"
alias g="gh stack"
