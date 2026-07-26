#!/bin/bash
# Ensure Docker Swarm is active (single-node manager). Idempotent.
# Used by make up / make dev before stack deploy.
#
# Intentionally does NOT change Swarm cluster orchestration settings
# (e.g. task-history-limit). Those are Docker-daemon-wide and would
# affect every stack on this Swarm, not only EIP. See docs/swarm/STACK.md.

set -euo pipefail

_EIP_LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")/../lib" && pwd)"
# shellcheck source=lib/require.sh
source "${_EIP_LIB}/require.sh"

require_docker || exit 1

state="$(swarm_local_state)"
if [ "${state}" = "active" ]; then
  echo "Swarm already active."
  exit 0
fi

echo "Initializing single-node Swarm (required for make up / make dev)…"
docker swarm init
echo "Swarm initialized."
