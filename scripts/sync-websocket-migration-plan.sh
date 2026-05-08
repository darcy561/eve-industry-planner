#!/usr/bin/env bash
# Overwrites docs/migrations/websocket-realtime/PLAN-SNAPSHOT.md from a local plan file.
# Usage: ./scripts/sync-websocket-migration-plan.sh /path/to/plan.md
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "usage: $0 <path-to-plan.md>" >&2
  echo "  Copies the file over docs/migrations/websocket-realtime/PLAN-SNAPSHOT.md" >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${REPO_ROOT}/docs/migrations/websocket-realtime/PLAN-SNAPSHOT.md"
SRC="$1"

if [[ ! -f "$SRC" ]]; then
  echo "error: source file not found: $SRC" >&2
  exit 1
fi

mkdir -p "$(dirname "$DEST")"
cp "$SRC" "$DEST"
echo "updated: $DEST (from $SRC)"
