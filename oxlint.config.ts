import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import vitest from "ultracite/oxlint/vitest";

export default defineConfig({
  extends: [core, vitest],
  ignorePatterns: [
    ...(core.ignorePatterns ?? []),
    // Keep the Davis suite diffable against upstream; it has its own checks.
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
    // Generated/minified browser bridge vendored with pi-mcp; source TS stays linted.
    "home/common/.pi/agent/extensions/pi-mcp/src/app-bridge.bundle.js",
  ],
  overrides: [
    {
      files: ["home/common/.pi/agent/extensions/pi-mcp/**"],
      rules: {
        // pi-mcp contains protocol/server glue where splitting callbacks further
        // makes the vendored adapter harder to compare with upstream.
        complexity: "off",
        "promise/avoid-new": "off",
        "promise/prefer-await-to-callbacks": "off",
        "promise/prefer-await-to-then": "off",
        "promise/prefer-catch": "off",
        // Treat await-less async callbacks as part of the scoped promise exception.
        "require-await": "off",
      },
    },
  ],
  rules: {
    "func-names": "off",
    "max-classes-per-file": "off",
    "no-use-before-define": "off",
    "unicorn/filename-case": "off",
  },
});
