#!/usr/bin/env bash
set -euo pipefail

if [ -z "${GITHUB_PERSONAL_ACCESS_TOKEN:-}" ]; then
  echo "Error: GITHUB_PERSONAL_ACCESS_TOKEN is not set" >&2
  exit 1
fi

REPO="github.com/tejasmeet-code/bot-neku.git"
REMOTE_URL="https://${GITHUB_PERSONAL_ACCESS_TOKEN}@${REPO}"

BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")

echo "Pushing branch '${BRANCH}' to GitHub..."
git push "$REMOTE_URL" "${BRANCH}:${BRANCH}" --force
echo "Done."
