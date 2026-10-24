_dotfiles_source_cached_integration "worktrunk-init-v1" wt config shell init zsh
_dotfiles_source_cached_integration "op-completion-v1" op completion zsh
_dotfiles_source_cached_integration "try-init-v1" try init "$HOME/Work/tries"
_dotfiles_source_cached_integration "boat-completions-v1" boat completions zsh --no-update

# Boat writes the sandbox/conversation it just created to these files so
# `boat new|start|fork|prompt` can export BOAT_CURRENT_ID/BOAT_CURRENT_CONVO.
boat() {
  local boat_bin="${commands[boat]:-}"
  if [[ -z "$boat_bin" ]]; then
    print -u2 "boat: command not found"
    return 127
  fi

  local current_file convo_file value
  current_file="$(mktemp)"
  convo_file="$(mktemp)"
  BOAT_CURRENT_ID_FILE="$current_file" BOAT_CURRENT_CONVO_FILE="$convo_file" \
    "$boat_bin" "$@"
  local code=$?

  if (( code == 0 )); then
    case "${1:-}" in
      new|start|fork)
        [[ -s "$current_file" ]] && value="$(tr -d '[:space:]' < "$current_file")"
        [[ -n "$value" ]] && export BOAT_CURRENT_ID="$value"
        ;;
      prompt)
        [[ -s "$convo_file" ]] && IFS= read -r value < "$convo_file"
        [[ -n "$value" ]] && export BOAT_CURRENT_CONVO="$value"
        ;;
    esac
  fi

  rm -f "$current_file" "$convo_file"
  return "$code"
}

# >>> hitch shell integration >>>
function _hitch_prompt_segment() {
  [[ -n "${HITCH_SESSION:-}" ]] && print -n "%F{2}#${HITCH_SESSION}%f "
}

function _hitch_precmd() {
  [[ -n "${POWERLEVEL9K_LEFT_PROMPT_ELEMENTS:-}" ]] && return
  [[ -z "${HITCH_SESSION:-}" ]] && return
  local _hitch_prefix="%F{2}#${HITCH_SESSION}%f "
  [[ "$PROMPT" == "${_hitch_prefix}"* ]] && return
  PROMPT="${_hitch_prefix}${PROMPT}"
}

if [[ -z "${HITCH_PROMPT_INSTALLED:-}" && -z "${POWERLEVEL9K_LEFT_PROMPT_ELEMENTS:-}" ]]; then
  HITCH_PROMPT_INSTALLED=1
  autoload -Uz add-zsh-hook
  add-zsh-hook precmd _hitch_precmd
fi

function _hitch_run() {
    local _hitch_command="$1"
    shift
    local _hitch_bin="${commands[$_hitch_command]:-}"
    if [[ -z "${_hitch_bin:-}" ]]; then
      print -u2 "$_hitch_command: command not found"
      return 127
    fi
    if [[ -z "${HITCH_SESSION:-}" && ( "$#" -eq 0 || "$1" == "on" || "$1" == "start" ) ]]; then
      fc -W 2>/dev/null
    fi

    local _hitch_cwd_file=""
    if [[ -z "${HITCH_SESSION:-}" ]]; then
      _hitch_cwd_file="${TMPDIR:-/tmp}/hitch-cwd-$$-$RANDOM"
      HITCH_CWD_SYNC_FILE="$_hitch_cwd_file" "$_hitch_bin" "$@"
    else
      "$_hitch_bin" "$@"
    fi
    local code=$?
    if [[ -n "$_hitch_cwd_file" && -s "$_hitch_cwd_file" ]]; then
      local _hitch_cwd
      _hitch_cwd="$(cat "$_hitch_cwd_file" 2>/dev/null)"
      if [[ -d "$_hitch_cwd" ]]; then
        cd "$_hitch_cwd" || return
      fi
    fi
    [[ -n "$_hitch_cwd_file" ]] && rm -f "$_hitch_cwd_file"
    if [[ "$code" -eq 42 ]]; then
      exit
    fi
    return "$code"
}

function hitch() {
  _hitch_run hitch "$@"
}

alias unhitch='hitch off'

function hitch-dev() {
  _hitch_run hitch-dev "$@"
}
# <<< hitch shell integration <<<
