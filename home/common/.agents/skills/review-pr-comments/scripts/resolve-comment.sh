#!/usr/bin/env bash
set -euo pipefail

ID="${1:-}"
REPLY="${2:-}"

if [ -z "$ID" ] || [ -z "$REPLY" ]; then
  echo "usage: $0 <thread-or-comment-id> <reply>" >&2
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "error: GitHub CLI (gh) is required" >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "error: jq is required" >&2
  exit 1
fi

PR_JSON="$(gh pr view --json number 2>/dev/null)" || {
  echo "error: no GitHub PR found for the active branch" >&2
  exit 1
}
PR_NUMBER="$(printf '%s' "$PR_JSON" | jq -r '.number')"

THREAD_ID="$ID"

if [[ "$ID" != PRRT_* ]]; then
  LOOKUP_QUERY='query($owner:String!, $repo:String!, $number:Int!) {
    repository(owner:$owner, name:$repo) {
      pullRequest(number:$number) {
        reviewThreads(first:100) {
          nodes {
            id
            comments(first:50) { nodes { id } }
          }
        }
      }
    }
  }'

  DATA="$(gh api graphql \
    -f query="$LOOKUP_QUERY" \
    -F owner='{owner}' \
    -F repo='{repo}' \
    -F number="$PR_NUMBER")"

  THREAD_ID="$(printf '%s' "$DATA" | jq -r --arg id "$ID" '
    .data.repository.pullRequest.reviewThreads.nodes[]
    | select([.comments.nodes[].id] | index($id))
    | .id
  ' | head -n 1)"

  if [ -z "$THREAD_ID" ] || [ "$THREAD_ID" = "null" ]; then
    echo "error: could not find a review thread containing comment id: $ID" >&2
    exit 1
  fi
fi

ADD_REPLY_QUERY='mutation($threadId:ID!, $body:String!) {
  addPullRequestReviewThreadReply(input:{threadId:$threadId, body:$body}) {
    comment { id url }
  }
}'

RESOLVE_QUERY='mutation($threadId:ID!) {
  resolveReviewThread(input:{threadId:$threadId}) {
    thread { id isResolved }
  }
}'

REPLY_RESULT="$(gh api graphql \
  -f query="$ADD_REPLY_QUERY" \
  -F threadId="$THREAD_ID" \
  -f body="$REPLY")"

RESOLVE_RESULT="$(gh api graphql \
  -f query="$RESOLVE_QUERY" \
  -F threadId="$THREAD_ID")"

COMMENT_URL="$(printf '%s' "$REPLY_RESULT" | jq -r '.data.addPullRequestReviewThreadReply.comment.url')"
RESOLVED="$(printf '%s' "$RESOLVE_RESULT" | jq -r '.data.resolveReviewThread.thread.isResolved')"

printf 'Resolved thread: %s\nReply: %s\nResolved: %s\n' "$THREAD_ID" "$COMMENT_URL" "$RESOLVED"
