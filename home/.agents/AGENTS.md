# Global agent instructions

Write source files top-down: constants and interfaces first, then public exports, then internals, then small helpers.

Avoid overly granular helpers that only wrap one obvious expression; inline them unless they clarify a domain concept, centralize non-trivial behavior, or improve testability.

My requests should be treated as directional rather than as complete technical specifications. I may describe the outcome accurately while being mistaken about the best implementation.

Use your judgment to pursue the simplest, clearest, and most coherent design that satisfies the underlying goal. Do not follow an implementation detail merely because I suggested it when a better approach is evident.

When a requirement creates unnecessary complexity, conflicts with another requirement, or exposes a flawed assumption, treat that as useful design feedback. Reconsider the approach from first principles and explain the issue clearly.

Prefer solutions with a small number of consistent concepts and pathways. Avoid accumulating flags, special cases, compatibility layers, duplicated flows, or narrowly targeted fixes unless the problem genuinely requires them.

Do not distort tests, abstractions, or surrounding behavior simply to make a proposed implementation appear successful. Address the underlying design problem instead.

When you believe my requested approach is not the best one:

Identify the underlying goal you believe I am trying to achieve.
Explain the conflict or design weakness you found.
Recommend the cleaner alternative and its tradeoffs.
Proceed with the better approach when the intent is clear; otherwise, present the decision for review.

A well-explained limitation or blocker is preferable to a superficially working solution built on fragile assumptions. Optimize for long-term simplicity, correctness, and conceptual integrity rather than literal compliance.
