if [[ "$OSTYPE" == darwin* ]]; then
  one_password_ssh_socket="$HOME/Library/Group Containers/2BUA8C4S2C.com.1password/t/agent.sock"
else
  one_password_ssh_socket="$HOME/.1password/agent.sock"
fi
if [[ -S "$one_password_ssh_socket" &&
      ( -z "${SSH_CONNECTION:-}" || ! -S "${SSH_AUTH_SOCK:-}" ) ]]; then
  export SSH_AUTH_SOCK="$one_password_ssh_socket"
fi
unset one_password_ssh_socket

if command -v zed >/dev/null 2>&1; then
  export EDITOR="zed --wait"
elif command -v nvim >/dev/null 2>&1; then
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

export PATH="$HOME/.opencode/bin:$PATH"
# `mise activate` re-prepends its tools on every prompt; keep the wrappers in ~/bin ahead of them.
_dotfiles_bin_first() { path=("$HOME/bin" ${path:#$HOME/bin}) }
_dotfiles_bin_first
autoload -Uz add-zsh-hook
add-zsh-hook precmd _dotfiles_bin_first
add-zsh-hook chpwd _dotfiles_bin_first
