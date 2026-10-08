# Whiteboard report format

The architectural review is a Whiteboard the user reads in Whiteboard Desktop. Nothing lands in the repo and nothing is written to disk.

## Creating the Whiteboard

1. Call `session_get_instructions` and `session_capabilities` from the Whiteboard MCP server. Take the tool mechanics from the instructions: component fields, source anchors, the activity calls, incremental writing. Ignore its section structure (what/why, requirements, design, implementation) and its file-lenses subagent step. Both assume a diff, and this report has none.
2. Call `session_create` with a `commits` target, `head: "HEAD"` and no `base`. That pins the review to the current source with no diff. Title it `Architecture review: <repo name>`.
3. Call `session_activity_begin` and pass its `activityId` on every `session_edit`.
4. Write one top-level `section` at a time so the user watches the report fill in. Call `session_activity_update` when you move to the next candidate.
5. Read the result back with `session_get({sessionId, full: true})`, fix anything unverified, then call `session_activity_end`.

Uncommitted work is not visible in a `commits` target. If the candidates depend on uncommitted files, say so in the legend callout.

If `desktopAvailable` is false or the Whiteboard tools are missing, present the same candidates in chat as markdown with the same fields, and tell the user Whiteboard was unavailable.

## Structure

Top-level sections, in this order:

1. **Legend.** One `callout` with tone `info`. It states how the diagrams read: a node is a module, a dashed edge is a leak across a seam, a `terminal` node is a deep module. No introduction paragraph.
2. **One `section` per candidate.** Title it `<n>. <deepening> · <strength>`, for example `2. Collapse the Order intake pipeline · Strong`. The strength in the title lets the user scan the collapsed outline.
3. **Top recommendation.** One `section` with a `callout` of tone `success`. Candidate name and one sentence on why.

## Candidate section

The diagrams carry the weight. Prose is sparse and uses the glossary terms from [LANGUAGE.md](LANGUAGE.md).

Children of each candidate `section`, in this order:

- **Tags.** One `markdown` line with the recommendation strength (`Strong`, `Worth exploring`, `Speculative`) and the dependency category (`in-process`, `local-substitutable`, `ports & adapters`, `mock`).
- **Files.** A `markdown` list. Every entry is a link of the form `[src/orders/intake.ts](review-source:head/src/orders/intake.ts#L10-L24)` with verified line numbers.
- **Before.** A diagram of today's structure. Every node or step that names real code carries a source anchor.
- **After.** A diagram of the deepened structure. The deepened module does not exist yet, so its nodes carry a `description` and no source. Modules that survive unchanged keep their anchors.
- **Evidence.** One or two `code_peek`s on the spot that shows the shallowness: a pass-through, a leaked type, a caller that knows too much. Skip it when the before diagram already makes the case.
- **Problem.** One sentence. What hurts.
- **Solution.** One sentence. What changes.
- **Wins.** Bullets of six words or fewer, in glossary terms. "Tests hit one interface", "Pricing logic stops leaking", "Delete 4 shallow modules".
- **ADR callout**, if the candidate contradicts an ADR. One line in a `callout` of tone `warning`, linking the ADR file.

No paragraphs of explanation. If the diagram needs a paragraph to be understood, redraw the diagram.

## Diagram patterns

Pick the pattern that fits the candidate. Whiteboard has no side-by-side layout, so before and after are two consecutive components titled `Before: …` and `After: …`.

### Dependency graph

`flow_diagram` is the default when the point is "X calls Y calls Z, and look at the mess". Before has one `process` node per module with its source under `attachments`, and `dashed` edges labelled `leak` wherever a module reaches across a seam. After has one `terminal` node for the deep module whose `description` lists what it absorbed, plus the callers and adapters that remain.

### Round trips

Use `sequence` when the friction is chatter between modules. Before has one step per call, each with a `source`. After has the one or two calls that remain, each with an `explanation` because the code does not exist yet.

### Layered shallowness

Use a `flow_diagram` with `direction: "down"` when a call passes through thin modules that each do nothing. Before is the chain, one node per pass-through. After is one node labelled with the consolidated responsibility.

### Call-graph collapse

`call_stack_diff` fits when the after path reuses functions that already exist, so both sides can anchor to real source. Root both sides at the user entry point, such as a CLI command or a request handler. If the after path needs code that does not exist, use the dependency graph instead. Frames cannot point at missing code.

### Interface as wide as the implementation

No diagram draws this well. Put a `code_peek` on the interface next to a `code_peek` on the implementation and state the line counts in the caption.

## Tone

Plain English, concise. The architectural nouns and verbs come from [LANGUAGE.md](LANGUAGE.md).

**Use exactly:** module, interface, implementation, depth, deep, shallow, seam, adapter, leverage, locality.

**Never substitute:** component, service, unit (for module) · API, signature (for interface) · boundary (for seam) · layer, wrapper (for module, when you mean module).

**Phrasings that fit the style:**

- "Order intake module is shallow. Interface nearly matches the implementation."
- "Pricing leaks across the seam."
- "Deepen: one interface, one place to test."
- "Two adapters justify the seam: HTTP in prod, in-memory in tests."

**Wins bullets** name the gain in glossary terms: _"locality: bugs concentrate in one module"_, _"leverage: one interface, N call sites"_, _"interface shrinks; implementation absorbs the pass-throughs"_. Don't write _"easier to maintain"_ or _"cleaner code"_. Those terms aren't in the glossary.

No hedging and no "it's worth noting that…". If a sentence could be a bullet, make it a bullet. If a bullet could be cut, cut it. If a term isn't in [LANGUAGE.md](LANGUAGE.md), use one that is before inventing a new one.
