import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import vitest from "ultracite/oxlint/vitest";

export default defineConfig({
  extends: [core, vitest],
  ignorePatterns: core.ignorePatterns,
  rules: {
    "func-names": "off",
    "max-classes-per-file": "off",
    "no-use-before-define": "off",
    "unicorn/filename-case": "off",
  },
});
