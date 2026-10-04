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
# Trash build/dependency directories, skipping any that hold git-tracked files (e.g. vendored fixtures).
bcd() {
  find . \( -name node_modules -o -name .next -o -name .turbo \) -type d -prune -print0 |
    while IFS= read -r -d '' dir; do
      [[ -n "$(git ls-files -- "$dir" 2>/dev/null | head -1)" ]] || print -rN -- "$dir"
    done |
    xargs -0 trash
}
alias clean-alchemy="find . -name .alchemy -type d -prune -exec trash {} +"
alias bi="bun install"
alias br="bun run"
alias bd="bun run dev || bun run d dev"
alias bl="bun run lint"
alias bct="bun run check:types || bun run type-check"
alias nv="nvim"
alias c="cursor"
alias cx='printf "\033[2J\033[3J\033[H" && claude --permission-mode bypassPermissions'
alias cy="codex -s danger-full-access -a never"
alias d="docker"
alias h="herdr"
alias mup="MISE_MINIMUM_RELEASE_AGE=0 mise up"
alias r="rails"
alias t="tmux attach || tmux new -s Work"
alias gsd="gs down"
alias gsb="gs bottom"
alias gsu="gs up"
alias gss="gs switch"
alias gst="gs top"
alias gss="gs submit"
