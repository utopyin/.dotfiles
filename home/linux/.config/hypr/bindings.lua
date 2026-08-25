-- Keep only your personal keybinding overrides here. Add new bindings or
-- unbind defaults before replacing them.

-- See current bindings and descriptions:
--   omarchy menu keybindings --print

-- To disable every Omarchy default binding, set this in
-- ~/.config/hypr/hyprland.lua before require("default.hypr.omarchy"), then add
-- only the bindings you want below:
--   omarchy_default_bindings = false

-- To disable all preinstalled app/webapp bindings, set:
--   omarchy_preinstalled_bindings = false

-- Add a new binding.
-- o.bind("SUPER + SHIFT + R", "SSH", "alacritty -e ssh your-server")

o.bind("MOD3 + C", "Zed", { launch = "zeditor" })

-- Show or hide maximized app scratchpads.
o.bind("MOD3 + L", "Toggle Linear", "~/.local/bin/toggle-linear")
o.bind("MOD3 + S", "Toggle Slack", "~/.local/bin/toggle-slack")
o.bind("MOD3 + B", "Toggle browser", "~/.local/bin/toggle-browser")

hl.unbind("ALT + CTRL + J")

-- Move the clipboard manager from SUPER+CTRL+V to Hyper+H.
hl.unbind("SUPER + CTRL + V")
o.bind("MOD3 + H", "Clipboard manager", "omarchy-shell shell toggle omarchy.clipboard")

-- SUPER+SHIFT+SPACE previously toggled the top bar.
hl.unbind("SUPER + SHIFT + SPACE")
o.bind("SUPER + SHIFT + SPACE", "1Password Quick Access", "1password --quick-access")

-- Use macOS-style Command shortcuts in 1Password Quick Access. SUPER+C is
-- already Omarchy's universal copy binding, so it forwards CTRL+C as needed.
local function onepassword_quick_access_active()
  local window = hl.get_active_window()
  return window
    and window.class == "1password"
    and window.title == "Quick Access — 1Password"
end

local function send_shortcut_once(mods, key)
  hl.dispatch(hl.dsp.send_key_state({ mods = mods, key = key, state = "down" }))
  hl.timer(function()
    hl.dispatch(hl.dsp.send_key_state({ mods = mods, key = key, state = "up" }))
  end, { timeout = 50, type = "oneshot" })
end

-- SUPER+SHIFT+C previously opened Calendar (and copied passwords in Quick Access).
-- Forward Chromium's Omarchy Copy URL shortcut instead.
hl.unbind("SUPER + SHIFT + C")
o.bind("SUPER + SHIFT + C", "Copy browser URL", function()
  send_shortcut_once("ALT + SHIFT", "L")
end)

o.bind("SUPER + ALT + C", "1Password copy one-time password", function()
  if onepassword_quick_access_active() then
    send_shortcut_once("CTRL + ALT", "C")
  end
end)

-- Swap the default ChatGPT and Agent shortcuts.
hl.unbind("SUPER + SHIFT + A")
hl.unbind("SUPER + SHIFT + CTRL + A")
o.bind("SUPER + SHIFT + A", "Agent", "omarchy-agent --pick")
o.bind("SUPER + SHIFT + CTRL + A", "ChatGPT", { webapp = "https://chatgpt.com" })

-- Change an existing binding by unbinding it first, then binding the key again.
-- This example changes SUPER+SPACE from the launcher to the Omarchy root menu.
-- hl.unbind("SUPER + SPACE")
-- o.bind("SUPER + SPACE", "Omarchy menu", "omarchy-menu toggle root")

-- Disable a default binding without replacing it.
-- hl.unbind("SUPER + SHIFT + B")

-- Logitech MX Keys examples:
-- o.bind("SUPER + SHIFT + S", nil, "omarchy-capture-screenshot")
-- o.bind("SUPER + H", nil, "voxtype record toggle")
-- o.bind("SUPER + PERIOD", nil, "omarchy-shell shell toggle omarchy.emojis")
