---
name: review-pr-comments
description: Review GitHub pull request comments on the active branch, verify whether each issue is still valid, implement fixes, and prepare a concise resolution summary. Use when the user asks to review PR comments, GitHub review comments, unresolved PR feedback, or comments on the current/active branch.
---

# Review PR Comments

## Quick start

1. Find the PR for the active branch and list recent review comments:
   ```bash
   scripts/list-last-comments.sh
   ```
2. For each comment/thread:
   - Read the feedback and inspect the current code.
   - Verify whether the issue is still valid before changing anything.
   - If the comment is stale, already fixed, duplicate, or not actionable, skip it and record why.
   - If the right fix requires a non-obvious product/design/API decision, ask the human before implementing.
   - Otherwise, make the smallest change that directly addresses the valid feedback.
3. Summarize the review with high signal:
   - What was fixed.
   - What was skipped and why.
   - Any decisions or risks.
4. Only after human confirmation, resolve addressed review threads:
   ```bash
   scripts/resolve-comment.sh <thread-or-comment-id> "Addressed by ..."
   ```

## Review workflow

### 1. Collect feedback

- Use the active branch PR, not an arbitrary PR.
- Prefer unresolved review threads first.
- If there are more comments than the script shows, continue fetching or inspect the PR directly with `gh`.
- Preserve comment IDs/thread IDs in notes so resolved threads can be updated later.

### 2. Validate before fixing

For every comment, decide one of:

- **Valid** — current code still has the issue; fix it.
- **Already addressed/stale** — current code no longer has the issue; skip and explain.
- **Duplicate** — another comment covers the same change; handle once and mention duplicates.
- **Needs human decision** — ask before implementing.
- **Not actionable** — explain briefly and ask if needed.

Do not blindly implement old review feedback without checking the current code.

### 3. Implement surgically

- Touch only files needed to address valid comments.
- Match existing project style.
- Avoid unrelated cleanup or refactors.
- If multiple comments share one root cause, fix the root cause once.

### 4. Report before resolving

Before marking anything resolved, provide a concise summary:

```md
Reviewed PR comments on the active branch.

Fixed:

- <comment/thread id>: <brief change>

Skipped:

- <comment/thread id>: <brief reason>

Needs confirmation:

- Resolve addressed comments with these response drafts? <yes/no>
```

### 5. Resolve after confirmation only

- Add a very brief resolution comment explaining how the feedback was addressed.
- Then mark the thread resolved.
- Do not resolve skipped comments unless the human explicitly asks.

## Scripts

- `scripts/list-last-comments.sh` — lists the last 5 PR review-thread comments for the active branch and indicates whether more exist.
- `scripts/resolve-comment.sh <thread-or-comment-id> <reply>` — posts a short reply and resolves the review thread. Requires GitHub CLI auth.
