-- Rex config, migrated from ~/.config/ghostty/config.
--
-- init.lua only covers keybindings, actions, and hosts. Set these in the Rex
-- Settings window instead (stored in the com.superlogical.rex defaults domain):
--   font-family = Geist Mono, font-style = medium
--   macos-option-as-alt = true
-- No Rex equivalent: custom-shader, macos-titlebar-style, auto-update-channel,
-- window-inherit-working-directory.

local config_dir = os.getenv("HOME") .. "/.config/rex"

-- Ghostty `theme = current-ide`. Run "Apply Dotfiles Theme" from the command
-- palette (or `rex do dotfiles_theme`) to import and select it.
rex.action{
  name = "dotfiles_theme",
  title = "Apply Dotfiles Theme",
  category = "Appearance",
  keywords = "theme current-ide ghostty",
  run = function(ctx, args)
    rex.client.queue("client.theme.import", { path = config_dir .. "/themes/current-ide" })
  end,
}
