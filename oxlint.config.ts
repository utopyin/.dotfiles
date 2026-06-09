import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import vitest from "ultracite/oxlint/vitest";

export default defineConfig({
  extends: [core, vitest],
  ignorePatterns: [
    ...(core.ignorePatterns ?? []),
    // Generated/minified browser bridge vendored with pi-mcp; source TS stays linted.
    "home/.pi/agent/extensions/pi-mcp/src/app-bridge.bundle.js",
  ],
  overrides: [
    {
      files: ["home/.pi/agent/extensions/pi-mcp/**"],
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
