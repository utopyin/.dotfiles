# Global agent instructions

- Write source files top-down: constants and interfaces first, then public exports, then internals, then small helpers.
- Avoid overly granular helpers that only wrap one obvious expression; inline them unless they clarify a domain concept, centralize non-trivial behavior, or improve testability.
