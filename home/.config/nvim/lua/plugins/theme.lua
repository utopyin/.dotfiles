return {
  {
    "datsfilipe/min-theme.nvim",
    lazy = false,
    priority = 1000,
    opts = {
      theme = "dark",
      transparent = false,
      italics = {
        comments = false,
        keywords = false,
        functions = false,
        strings = false,
        variables = false,
      },
      overrides = {
        Normal = { fg = "#BBBBBB", bg = "#1A1A1A" },
        NormalNC = { fg = "#BBBBBB", bg = "#1A1A1A" },
        SignColumn = { bg = "#1A1A1A" },
        CursorLine = { bg = "#2A2A2A" },
        CursorLineNr = { fg = "#727272" },
        LineNr = { fg = "#727272" },
        NormalFloat = { bg = "#141414" },
        StatusLine = { fg = "#999999", bg = "#141414" },
        StatusLineNC = { fg = "#727272", bg = "#141414" },
        TabLine = { fg = "#999999", bg = "#1A1A1A" },
        TabLineFill = { bg = "#1A1A1A" },
      },
    },
  },
  {
    "LazyVim/LazyVim",
    opts = {
      colorscheme = "min-theme",
    },
  },
}
