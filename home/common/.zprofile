if [[ -x /opt/homebrew/bin/brew ]]; then
  eval "$(/opt/homebrew/bin/brew shellenv)"
fi

# OrbStack command-line tools and integration.
if [[ "$OSTYPE" == darwin* ]]; then
  source "$HOME/.orbstack/shell/init.zsh" 2>/dev/null || :
fi
