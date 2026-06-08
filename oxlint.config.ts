import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import vitest from "ultracite/oxlint/vitest";

export default defineConfig({
  extends: [core, vitest],
  ignorePatterns: [
    ...(core.ignorePatterns ?? []),
    // Gradually enable vendored Pi extensions one extension at a time.
    "home/.pi/agent/extensions/pi-cloak/**",
    "home/.pi/agent/extensions/pi-mcp/**",
    "home/.pi/agent/extensions/pi-skill-toggle/**",
    "home/.pi/agent/extensions/todos/**",
    "home/.pi/agent/extensions/web-tools/**",
  ],
  rules: {
    "func-names": "off",
    "max-classes-per-file": "off",
    "no-use-before-define": "off",
    "unicorn/filename-case": "off",
  },
});
