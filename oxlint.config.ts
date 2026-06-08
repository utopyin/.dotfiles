import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import vitest from "ultracite/oxlint/vitest";

export default defineConfig({
  extends: [core, vitest],
  ignorePatterns: [
    ...(core.ignorePatterns ?? []),
    // Pi extension files live under a hidden path that oxfmt skips by default.
    // They are linted/formatted through scripts/pi-extension-pipeline.ts,
    // which calls oxlint with --no-ignore and oxfmt via stdin.
    "home/.pi/agent/extensions/**",
  ],
  rules: {
    "func-names": "off",
    "max-classes-per-file": "off",
    "no-use-before-define": "off",
    "unicorn/filename-case": "off",
  },
});
