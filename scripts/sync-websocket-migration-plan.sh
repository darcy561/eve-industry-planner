#!/usr/bin/env bash
# Overwrites docs/migrations/websocket-realtime/PLAN-SNAPSHOT.md from the Cursor plan on disk.
# Run from repo root after editing the plan in Cursor: ./scripts/sync-websocket-migration-plan.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${REPO_ROOT}/docs/migrations/websocket-realtime/PLAN-SNAPSHOT.md"
DEFAULT_SRC="${HOME}/.cursor/plans/websocket_realtime_migration_3239c62b.plan.md"
SRC="${1:-$DEFAULT_SRC}"

if [[ ! -f "$SRC" ]]; then
  echo "error: plan source not found: $SRC" >&2
  echo "usage: $0 [path/to/websocket_realtime_migration_3239c62b.plan.md]" >&2
  exit 1
fi

mkdir -p "$(dirname "$DEST")"
cp "$SRC" "$DEST"

NOTE='> **Repository mirror** of the Cursor plan `websocket_realtime_migration_3239c62b`. **Canonical (editable) copy:** `~/.cursor/plans/websocket_realtime_migration_3239c62b.plan.md`. Whenever that plan changes, refresh this file by running **`./scripts/sync-websocket-migration-plan.sh`** from the repo root (script overwrites `PLAN-SNAPSHOT.md`).
'

if ! grep -q 'Repository mirror' "$DEST"; then
  tmp="${DEST}.tmp"
  awk -v note="$NOTE" '
    BEGIN { after_yaml = 0; printed_note = 0 }
    /^---$/ { print; dash++; if (dash == 2) after_yaml = 1; next }
    after_yaml && printed_note == 0 && /^# / { print note; print ""; printed_note = 1 }
    { print }
  ' "$DEST" > "$tmp" && mv "$tmp" "$DEST"
fi

echo "updated: $DEST (from $SRC)"
