[[ -r /usr/share/omarchy/default/bash/env-bootstrap ]] &&
  source /usr/share/omarchy/default/bash/env-bootstrap

export BROWSER="${BROWSER:-omarchy-launch-browser}"

alias a="omarchy-agent --inline"
alias zed="zeditor"

open() {
  command xdg-open "$@" >/dev/null 2>&1 &
}

sff() {
  (( $# == 0 )) && print -u2 "Usage: sff <destination>" && return 1
  local file
  file="$(find . -type f -printf '%T@\t%p\n' | sort -rn | cut -f2- | ff)" || return
  [[ -n "$file" ]] && command scp "$file" "$1"
}

iso2sd() {
  (( $# < 1 )) && {
    print -u2 "Usage: iso2sd <input_file> [output_device]"
    return 1
  }

  local iso="$1"
  local drive="${2:-}"

  if [[ -z "$drive" ]]; then
    local available_sds
    available_sds="$(lsblk -dpno NAME | grep -E '/dev/sd')"
    [[ -n "$available_sds" ]] || {
      print -u2 "No SD drives found and no drive specified"
      return 1
    }
    drive="$(omarchy-drive-select "$available_sds")"
    [[ -n "$drive" ]] || return 1
  fi

  sudo dd bs=4M status=progress oflag=sync if="$iso" of="$drive"
  sudo eject "$drive"
}

format-drive() {
  if (( $# != 2 )); then
    print -u2 "Usage: format-drive <device> <name>"
    lsblk -d -o NAME -n | awk '{print "/dev/"$1}'
    return 1
  fi

  print "WARNING: This will completely erase all data on $1 and label it '$2'."
  local confirm
  read -r "confirm?Continue? (y/N): "
  [[ "$confirm" == [Yy] ]] || return 0

  sudo wipefs -a "$1"
  sudo dd if=/dev/zero of="$1" bs=1M count=100 status=progress
  sudo parted -s "$1" mklabel gpt
  sudo parted -s "$1" mkpart primary 1MiB 100%
  sudo parted -s "$1" set 1 msftdata on

  local partition
  [[ "$1" == *nvme* ]] && partition="${1}p1" || partition="${1}1"
  sudo partprobe "$1" || true
  sudo udevadm settle || true
  sudo mkfs.exfat -n "$2" "$partition"
}

_omarchy() {
  (( $+commands[omarchy] && $+commands[jq] )) || return 1

  local payload route prefix
  local -a routes parts candidates options
  local -i i matches

  payload="$(command omarchy commands --json 2>/dev/null)" || return 1
  routes=("${(@f)$(print -r -- "$payload" | jq -r '.commands[] | select(.hidden == false) | .routes[]')}")

  for route in "${routes[@]}"; do
    parts=(${=route})
    matches=1
    for (( i = 2; i < CURRENT; i++ )); do
      if (( i > ${#parts} )) || [[ "${parts[i]}" != "${words[i]}" ]]; then
        matches=0
        break
      fi
    done
    (( matches && CURRENT <= ${#parts} )) && candidates+=("${parts[CURRENT]}")
  done

  candidates=("${(@u)candidates}")
  if (( ${#candidates} )); then
    _describe -t commands "omarchy command" candidates
    return
  fi

  prefix="${(j: :)words[1,CURRENT-1]}"
  options=("${(@f)$(print -r -- "$payload" | jq -r --arg route "$prefix" '.commands[] | select(.route == $route) | (.args // "") | scan("--[[:alnum:]-]+")')}")
  options=("${(@u)options}")
  (( ${#options} )) && _describe -t options "omarchy option" options
}

compdef _omarchy omarchy
