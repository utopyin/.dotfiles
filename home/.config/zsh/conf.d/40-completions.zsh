fpath=("$HOME/.config/zsh/completions" $fpath)

# bun completions
_bun_completion_file="${BUN_INSTALL:-$HOME/.bun}/_bun"
if [[ -s "$_bun_completion_file" ]]; then
  source "$_bun_completion_file"
fi
unset _bun_completion_file

eval "$(direnv hook zsh)"
