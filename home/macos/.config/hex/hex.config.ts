import { defineHexConfig } from "@hex/commands";

// Hex runs this file itself and reloads it when you save. It is plain
// TypeScript or JavaScript with no npm packages: transformations return text.
// fetch and node:child_process are there once you allow them in Hex; see
// https://anoma.ly/hex/docs/transforms
export default defineHexConfig({
  // Transformations appear as optional final steps in every dictation mode.
  transformations: {
    "lowercase-first-letter": {
      description: "Start with a lowercase letter, keep the rest as is",
      name: "Lowercase first letter",
      // Leaves acronyms like "API" alone (next letter also uppercase).
      transform: (text) =>
        text.replace(
          /^(\P{L}*)(\p{Lu})(?!\p{Lu})/u,
          (_, lead, first) => lead + first.toLowerCase()
        ),
    },
  },
});
