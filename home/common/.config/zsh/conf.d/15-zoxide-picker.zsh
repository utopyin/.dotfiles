typeset -g _DOTFILES_ZOXIDE_GITSTATUS_NAME="ZOXIDE_PICKER"
typeset -gi _dotfiles_zoxide_gitstatus_ready=0
typeset -g _dotfiles_zoxide_selection=""
typeset -ga _dotfiles_zoxide_candidates=()

_dotfiles_zoxide_start_gitstatus() {
  (( _dotfiles_zoxide_gitstatus_ready )) && return 0
  (( $+functions[gitstatus_start_p9k_] )) || return 1

  if gitstatus_start_p9k_ -s 0 -u 0 -c 0 -d 0 -m 0 "$_DOTFILES_ZOXIDE_GITSTATUS_NAME"; then
    _dotfiles_zoxide_gitstatus_ready=1
    return 0
  fi
  return 1
}

_dotfiles_zoxide_git_label() {
  local candidate_path="$1"
  local ref=""
  local action=""
  local icon=""

  if (( _dotfiles_zoxide_gitstatus_ready )) &&
    gitstatus_query_p9k_ -d "$candidate_path" -t 0.1 "$_DOTFILES_ZOXIDE_GITSTATUS_NAME" 2>/dev/null; then
    if [[ "$VCS_STATUS_RESULT" == "norepo-sync" ]]; then
      return 1
    fi
    if [[ "$VCS_STATUS_RESULT" == "ok-sync" ]]; then
      if [[ -n "$VCS_STATUS_LOCAL_BRANCH" ]]; then
        ref="$VCS_STATUS_LOCAL_BRANCH"
      elif [[ -n "$VCS_STATUS_TAG" ]]; then
        icon=""
        ref="$VCS_STATUS_TAG"
      elif [[ -n "$VCS_STATUS_COMMIT" ]]; then
        icon="@"
        ref="${VCS_STATUS_COMMIT[1,8]}"
      fi
      action="$VCS_STATUS_ACTION"
    fi
  fi

  if [[ -z "$ref" ]]; then
    ref="$(command git -C "$candidate_path" symbolic-ref --quiet --short HEAD 2>/dev/null)" ||
      ref="$(command git -C "$candidate_path" rev-parse --short HEAD 2>/dev/null)" || return 1
  fi

  [[ -n "$ref" ]] || return 1
  if (( ${#ref} > 32 )); then
    ref="${ref[1,14]}…${ref[-14,-1]}"
  fi

  REPLY="$icon $ref"
  [[ -z "$action" ]] || REPLY+=" | $action"
}

_dotfiles_zoxide_format_candidate() {
  local line="$1"
  local candidate_path="${line[8,-1]}"
  local label=""
  local colored_label=""

  if _dotfiles_zoxide_git_label "$candidate_path"; then
    label="$REPLY"
    colored_label=$'\e[32m'"${label%% | *}"$'\e[0m'
    if [[ "$label" == *" | "* ]]; then
      colored_label+=$'\e[33m'" | ${label#* | }"$'\e[0m'
    fi
  fi

  local -i content_width=$((${COLUMNS:-120} - 7))
  (( content_width < 40 )) && content_width=40

  local left="$line"
  if [[ -n "$label" ]]; then
    local -i max_left=$((content_width - ${#label} - 2))
    if (( ${#left} > max_left )); then
      local score="${line[1,6]}"
      local -i max_path=$((max_left - 7))
      if (( max_path > 1 )); then
        local -i tail_width=$((max_path - 1))
        candidate_path="…${candidate_path[-tail_width,-1]}"
        left="$score $candidate_path"
      fi
    fi

    local -i padding=$((content_width - ${#left} - ${#label}))
    (( padding < 2 )) && padding=2
    local spaces=""
    printf -v spaces "%*s" "$padding" ""
    left+="$spaces$colored_label"
  fi

  REPLY="${line[8,-1]}"$'\t'"$left"
}

_dotfiles_zoxide_build_candidates() {
  local -a lines
  lines=("${(@f)$(command zoxide query --list --score --exclude "$(__zoxide_pwd || builtin true)" -- "$@")}")
  _dotfiles_zoxide_candidates=()
  (( ${#lines} )) || return 1
  _dotfiles_zoxide_start_gitstatus || true

  local line
  for line in "${lines[@]}"; do
    [[ ${#line} -ge 8 ]] || continue
    _dotfiles_zoxide_format_candidate "$line"
    _dotfiles_zoxide_candidates+=("$REPLY")
  done
}

_dotfiles_zoxide_select() {
  _dotfiles_zoxide_selection=""
  _dotfiles_zoxide_build_candidates "$@"
  (( ${#_dotfiles_zoxide_candidates} )) || return 1

  _dotfiles_zoxide_selection="$({
    printf "%s\0" "${_dotfiles_zoxide_candidates[@]}"
  } | CLICOLOR=1 CLICOLOR_FORCE=1 SHELL=sh \
    FZF_DEFAULT_OPTS="${_ZO_FZF_OPTS:-${FZF_DEFAULT_OPTS:-}}" \
    fzf \
      --read0 \
      --delimiter=$'\t' \
      --with-nth=2 \
      --nth=1 \
      --accept-nth=1 \
      --exact \
      --no-sort \
      --ansi \
      --no-hscroll \
      --bind="ctrl-z:ignore,btab:up,tab:down" \
      --cycle \
      --border=sharp \
      --height=45% \
      --info=inline \
      --layout=reverse \
      --tabstop=1 \
      --exit-0 \
      --preview='command -p ls -Cp {1}' \
      --preview-window="down,30%,sharp")"
}

if [[ -o zle ]]; then
  __zoxide_z_complete() {
    [[ "${#words[@]}" -eq "$CURRENT" ]] || return 0

    if [[ "${#words[@]}" -eq 2 ]]; then
      _cd -/
    elif [[ "${words[-1]}" == "" ]]; then
      _dotfiles_zoxide_select "${(@)words[2,-2]}" || true
      __zoxide_result="$_dotfiles_zoxide_selection"

      compadd -Q ""
      builtin bindkey '\e[0n' '__zoxide_z_complete_helper'
      builtin printf '\e[5n'
      return 0
    fi
  }

  compdef __zoxide_z_complete z
fi
