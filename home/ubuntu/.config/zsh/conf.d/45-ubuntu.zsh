if (( $+commands[xdg-open] )); then
  open() {
    command xdg-open "$@" >/dev/null 2>&1 &
  }
fi
