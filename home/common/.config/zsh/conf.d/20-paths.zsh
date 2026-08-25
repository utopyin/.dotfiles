if (( $+commands[zed] )); then
  export EDITOR="zed --wait"
elif (( $+commands[nvim] )); then
  export EDITOR="nvim"
fi

# pnpm
if [[ "$OSTYPE" == darwin* ]]; then
  export PNPM_HOME="${PNPM_HOME:-$HOME/Library/pnpm}"
else
  export PNPM_HOME="${PNPM_HOME:-$HOME/.local/share/pnpm}"
fi
case ":$PATH:" in
  *":$PNPM_HOME:"*) ;;
  *) export PATH="$PNPM_HOME:$PATH" ;;
esac
# pnpm end
if [[ "$OSTYPE" == darwin* ]]; then
  export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
fi

export PATH="/opt/zig:$PATH"

export PATH="$HOME/.opencode/bin:$PATH"
export PATH="$HOME/bin:$PATH"
