setopt CHASE_LINKS
_dotfiles_source_cached_integration "mise-activate-zsh-v1" mise activate zsh
_dotfiles_source_cached_integration "zoxide-init-v1" zoxide init zsh

# A function to visually change directories with lstr
lcd() {
    # Run lstr and capture the selected path into a variable.
    # The TUI will draw on stderr, and the final path will be on stdout.
    local selected_dir
    # i for interactive, -a for all, -s for file sizes, -G for git status, -g for git ignore, --icons to show nerd font icons
    selected_dir="$(lstr i -saGg --icons)"

    # If the user selected a path (and didn't just quit), `cd` into it.
    # Check if the selection is a directory.
    if [[ -n "$selected_dir" && -d "$selected_dir" ]]; then
        cd "$selected_dir"
    fi
}


