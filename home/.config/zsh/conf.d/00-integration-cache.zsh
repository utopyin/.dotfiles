typeset -g DOTFILES_ZSH_CACHE_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/zsh/integrations"

if [[ ! -d "$DOTFILES_ZSH_CACHE_DIR" ]]; then
  mkdir -p "$DOTFILES_ZSH_CACHE_DIR"
fi

_dotfiles_source_cached_integration() {
  local cache_name="$1"
  local binary_name="$2"
  shift 2

  local binary_path="${commands[$binary_name]:-}"
  [[ -n "$binary_path" ]] || return 0

  local cache_file="$DOTFILES_ZSH_CACHE_DIR/$cache_name.zsh"
  local temporary_file="$cache_file.tmp.$$"

  if [[ ! -s "$cache_file" || "$binary_path" -nt "$cache_file" ]]; then
    if "$binary_path" "$@" >| "$temporary_file"; then
      mv -f "$temporary_file" "$cache_file"
    else
      rm -f "$temporary_file"
    fi
  fi

  [[ ! -r "$cache_file" ]] || source "$cache_file"
}
