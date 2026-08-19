export EDITOR="zed --wait"

# pnpm
export PNPM_HOME="${PNPM_HOME:-$HOME/Library/pnpm}"
case ":$PATH:" in
  *":$PNPM_HOME:"*) ;;
  *) export PATH="$PNPM_HOME:$PATH" ;;
esac
# pnpm end
export PATH="/opt/homebrew/opt/libpq/bin:$PATH"

export PATH="/opt/zig:$PATH"

export PATH="$HOME/.opencode/bin:$PATH"
export PATH="$HOME/bin:$PATH"
