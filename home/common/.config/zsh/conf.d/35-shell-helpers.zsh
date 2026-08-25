compress() {
  tar -czf "${1%/}.tar.gz" "${1%/}"
}

alias decompress="tar -xzf"

n() {
  if (( $# == 0 )); then
    command nvim .
  else
    command nvim "$@"
  fi
}

ff() {
  if [[ "$TERM" == "xterm-kitty" ]]; then
    command fzf --preview 'case $(file --mime-type -b {}) in image/*) kitty icat --clear --transfer-mode=memory --stdin=no --place=${FZF_PREVIEW_COLUMNS}x${FZF_PREVIEW_LINES}@0x0 {} ;; *) bat --style=numbers --color=always {} ;; esac' "$@"
  else
    command fzf --preview 'bat --style=numbers --color=always {}' "$@"
  fi
}

eff() {
  local file
  file="$(ff)" || return
  [[ -n "$file" ]] && ${=EDITOR} "$file"
}

fip() {
  (( $# < 2 )) && print -u2 "Usage: fip <host> <port1> [port2] ..." && return 1
  local host="$1"
  shift
  local port
  for port in "$@"; do
    command ssh -f -N -L "${port}:localhost:${port}" "$host" &&
      print "Forwarding localhost:$port -> $host:$port"
  done
}

dip() {
  (( $# == 0 )) && print -u2 "Usage: dip <port1> [port2] ..." && return 1
  local port
  for port in "$@"; do
    if pkill -f "ssh.*-L ${port}:localhost:${port}"; then
      print "Stopped forwarding port $port"
    else
      print "No forwarding on port $port"
    fi
  done
}

lip() {
  local -a pgrep_args
  [[ "$OSTYPE" == darwin* ]] && pgrep_args=(-fl) || pgrep_args=(-af)
  pgrep "${pgrep_args[@]}" "ssh.*-L [0-9]+:localhost:[0-9]+" || print "No active forwards"
}

_ssh_disarm() {
  printf '\e[?1000l\e[?1002l\e[?1003l\e[?1006l\e[?1004l\e[?1049l\e[?25h'
}

_ssh_interactive() {
  local value_opts="BbcDEeFIiJLlmOoPpQRSWw"
  local -a argv=("$@")
  local arg letters dest="" opts_done=""
  local -i i

  while (( $# )); do
    arg="$1"
    shift

    if [[ -z "$opts_done" && "$arg" == "--" ]]; then
      opts_done=1
    elif [[ -z "$opts_done" && "$arg" == -?* ]]; then
      letters="${arg#-}"
      for (( i = 0; i < ${#letters}; i++ )); do
        if [[ "$value_opts" == *"${letters:i:1}"* ]]; then
          (( i == ${#letters} - 1 )) && shift
          break
        fi
      done
    elif [[ -z "$dest" ]]; then
      dest="$arg"
    else
      return 1
    fi
  done

  [[ -n "$dest" ]] || return 1

  local resolved
  resolved="$(command ssh -G "${argv[@]}" 2>/dev/null)" || return 1
  ! grep -i '^remotecommand ' <<<"$resolved" | grep -qvi '^remotecommand none$'
}

ssh() {
  local -i rc started=$SECONDS

  command ssh "$@"
  rc=$?

  [[ -t 1 ]] || return $rc
  _ssh_disarm

  if (( rc != 255 )) || [[ ! -t 0 ]] || ! _ssh_interactive "$@" ||
    (( SECONDS - started < 30 )); then
    return $rc
  fi

  (
    while true; do
      print "Connection lost. Reconnecting (Ctrl-C to stop)..."
      sleep 2
      command ssh "$@"
      rc=$?
      _ssh_disarm
      (( rc != 255 )) && exit $rc
    done
  )
}
