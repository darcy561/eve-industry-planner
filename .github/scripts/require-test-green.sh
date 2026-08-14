#!/usr/bin/env bash
# Fail unless workflow "test" (.github/workflows/test.yml) has a successful
# completed run for the given commit SHA. Used as a ship gate; does not publish.
#
# Usage: require-test-green.sh <sha>
set -euo pipefail

SHA="${1:-}"
if [ -z "${SHA}" ]; then
  echo "Usage: $0 <sha>" >&2
  exit 2
fi

if [ -z "${GITHUB_REPOSITORY:-}" ]; then
  echo "::error::GITHUB_REPOSITORY is not set" >&2
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "::error::gh CLI is required" >&2
  exit 1
fi

# Newest successful completed run for this exact commit.
RUN_ID="$(
  gh api \
    "repos/${GITHUB_REPOSITORY}/actions/workflows/test.yml/runs?head_sha=${SHA}&status=completed&per_page=30" \
    --jq '[.workflow_runs[] | select(.conclusion == "success")] | first | .id // empty'
)"

if [ -z "${RUN_ID}" ]; then
  echo "::error::No successful test workflow run for commit ${SHA}."
  echo "::error::Wait for CI on Public/Development, or run: gh workflow run test.yml --ref <branch>"
  echo "::error::Then re-run this ship workflow."
  exit 1
fi

echo "OK: test.yml run ${RUN_ID} succeeded for ${SHA}"
