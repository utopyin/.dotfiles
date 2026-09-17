stable_ssh_auth_sock="$HOME/.ssh/agent.sock"
one_password_ssh_auth_sock="$HOME/.1password/agent.sock"
one_password_macos_ssh_auth_sock="$HOME/Library/Group Containers/2BUA8C4S2C.com.1password/t/agent.sock"

if [[ -n "${SSH_CONNECTION:-}" &&
      -n "${SSH_AUTH_SOCK:-}" &&
      "$SSH_AUTH_SOCK" != "$stable_ssh_auth_sock" &&
      "$SSH_AUTH_SOCK" != "$one_password_ssh_auth_sock" &&
      "$SSH_AUTH_SOCK" != "$one_password_macos_ssh_auth_sock" &&
      -S "$SSH_AUTH_SOCK" ]]; then
  ln -sfn "$SSH_AUTH_SOCK" "$stable_ssh_auth_sock"
fi

if [[ -n "${SSH_CONNECTION:-}" && -S "$stable_ssh_auth_sock" ]]; then
  export SSH_AUTH_SOCK="$stable_ssh_auth_sock"
fi

unset stable_ssh_auth_sock one_password_ssh_auth_sock one_password_macos_ssh_auth_sock

# Mise shims keep tools such as op and gh reachable from non-interactive shells;
# interactive shells get exact versions from `mise activate`.
mise_shims_dir="${XDG_DATA_HOME:-$HOME/.local/share}/mise/shims"
if [[ -d "$mise_shims_dir" && ":$PATH:" != *":$mise_shims_dir:"* ]]; then
  export PATH="$PATH:$mise_shims_dir"
fi
unset mise_shims_dir
