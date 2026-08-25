#!/usr/bin/env bash
set -euo pipefail

LIMIT="${1:-5}"

if ! command -v gh >/dev/null 2>&1; then
  echo "error: GitHub CLI (gh) is required" >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "error: jq is required" >&2
  exit 1
fi

PR_JSON="$(gh pr view --json number,url,headRefName 2>/dev/null)" || {
  echo "error: no GitHub PR found for the active branch" >&2
  exit 1
}

PR_NUMBER="$(printf '%s' "$PR_JSON" | jq -r '.number')"
PR_URL="$(printf '%s' "$PR_JSON" | jq -r '.url')"
BRANCH="$(printf '%s' "$PR_JSON" | jq -r '.headRefName')"

QUERY='query($owner:String!, $repo:String!, $number:Int!) {
  repository(owner:$owner, name:$repo) {
    pullRequest(number:$number) {
      reviewThreads(first:100) {
        nodes {
          id
          isResolved
          path
          line
          comments(first:50) {
            nodes {
              id
              body
              author { login }
              createdAt
              url
            }
          }
        }
      }
    }
  }
}'

DATA="$(gh api graphql \
  -f query="$QUERY" \
  -F owner='{owner}' \
  -F repo='{repo}' \
  -F number="$PR_NUMBER")"

TOTAL="$(printf '%s' "$DATA" | jq '[.data.repository.pullRequest.reviewThreads.nodes[].comments.nodes[]] | length')"

printf 'PR #%s on %s: %s\n' "$PR_NUMBER" "$BRANCH" "$PR_URL"
printf 'Showing last %s of %s review comments.\n' "$LIMIT" "$TOTAL"
if [ "$TOTAL" -gt "$LIMIT" ]; then
  printf 'There are more comments than shown. Increase the limit: %s 20\n' "$0"
fi
printf '\n'

printf '%s' "$DATA" | jq -r --argjson limit "$LIMIT" '
  [.data.repository.pullRequest.reviewThreads.nodes[] as $thread
    | $thread.comments.nodes[]
    | {
        threadId: $thread.id,
        threadResolved: $thread.isResolved,
        commentId: .id,
        author: (.author.login // "unknown"),
        createdAt,
        path: $thread.path,
        line: $thread.line,
        url,
        body
      }
  ]
  | sort_by(.createdAt)
  | reverse
  | .[:$limit]
  | .[]
  | "THREAD: \(.threadId)\nCOMMENT: \(.commentId)\nRESOLVED: \(.threadResolved)\nAUTHOR: \(.author)\nWHERE: \(.path):\(.line // "?")\nCREATED: \(.createdAt)\nURL: \(.url)\nBODY:\n\(.body)\n---"
'
