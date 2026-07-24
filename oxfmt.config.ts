import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
  ...ultracite,
  ignorePatterns: [
    ...(ultracite.ignorePatterns ?? []),
    // Keep the Davis suite formatted by its upstream Prettier configuration.
    "home/.pi/agent/extensions/ask-user/**",
    "home/.pi/agent/extensions/background-terminals/**",
    "home/.pi/agent/extensions/copy-all/**",
    "home/.pi/agent/extensions/file-search/**",
    "home/.pi/agent/extensions/firecrawl-search/**",
    "home/.pi/agent/extensions/git-info/**",
    "home/.pi/agent/extensions/model-info/**",
    "home/.pi/agent/extensions/shared/**",
    "home/.pi/agent/extensions/subagents/**",
    "home/.pi/agent/extensions/ui-customization/**",
    "home/.pi/agent/extensions/workflows/**",
  ],
});
