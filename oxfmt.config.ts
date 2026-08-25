import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
  ...ultracite,
  ignorePatterns: [
    ...(ultracite.ignorePatterns ?? []),
    // Preserve the generated Raycast-to-Espanso import byte-for-byte.
    "home/linux/.config/espanso/match/raycast-import.yml",
    // Keep the Davis suite formatted by its upstream Prettier configuration.
    "home/common/.pi/agent/extensions/ask-user/**",
    "home/common/.pi/agent/extensions/background-terminals/**",
    "home/common/.pi/agent/extensions/copy-all/**",
    "home/common/.pi/agent/extensions/file-search/**",
    "home/common/.pi/agent/extensions/firecrawl-search/**",
    "home/common/.pi/agent/extensions/git-info/**",
    "home/common/.pi/agent/extensions/model-info/**",
    "home/common/.pi/agent/extensions/shared/**",
    "home/common/.pi/agent/extensions/subagents/**",
    "home/common/.pi/agent/extensions/ui-customization/**",
    "home/common/.pi/agent/extensions/workflows/**",
  ],
});
