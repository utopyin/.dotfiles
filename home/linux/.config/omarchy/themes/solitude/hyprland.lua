local active_border_color = "rgba(79b8ffee)"
local inactive_border_color = "rgb(2a2a2a)"

hl.config({
  general = {
    col = {
      active_border = active_border_color,
      inactive_border = inactive_border_color,
    },
  },
  group = {
    col = {
      border_active = active_border_color,
      border_inactive = inactive_border_color,
    },
  },
  decoration = {
    rounding = 6,
    rounding_power = 3,
  },
})
