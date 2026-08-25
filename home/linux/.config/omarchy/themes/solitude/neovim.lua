return {
  {
    "bjarneo/aether.nvim",
    branch = "v3",
    name = "aether",
    priority = 1000,
    opts = {
      colors = {
        bg = "#1A1A1A",
        dark_bg = "#141414",
        darker_bg = "#000000",
        lighter_bg = "#2A2A2A",

        fg = "#BBBBBB",
        dark_fg = "#898989",
        light_fg = "#D1D1D1",
        bright_fg = "#F8F8F8",
        muted = "#727272",

        red = "#FA7584",
        yellow = "#FFAB70",
        orange = "#FFAB70",
        green = "#79B8FF",
        cyan = "#79B8FF",
        blue = "#B392F1",
        magenta = "#E394DC",
        brown = "#B376B0",

        bright_red = "#FF9CAA",
        bright_yellow = "#FFC9A3",
        bright_green = "#A3D0FF",
        bright_cyan = "#A3D0FF",
        bright_blue = "#CFB8FF",
        bright_magenta = "#F3B8EC",

        accent = "#79B8FF",
        cursor = "#F8F8F8",
        foreground = "#BBBBBB",
        background = "#1A1A1A",
        selection = "#2A2A2A",
        selection_foreground = "#F8F8F8",
        selection_background = "#2A2A2A",
      },
    },
  },
  {
    "LazyVim/LazyVim",
    opts = {
      colorscheme = "aether",
    },
  },
}
