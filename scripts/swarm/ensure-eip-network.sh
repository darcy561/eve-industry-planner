#!/bin/bash
# Create-once bootstrap for the shared Docker network (default eip-core).
#
# If missing, creates a bridge (Compose-only safety). Hybrid make up/dev
# uses attachable overlay via ensure-eip-overlay (see docs/swarm/NETWORK.md).
#
# Idempotent: exits 0 if the network already exists (any driver).

set -euo pipefail

_EIP_LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")/../lib" && pwd)"
# shellcheck source=lib/paths.sh
source "${_EIP_LIB}/paths.sh"
# shellcheck source=lib/require.sh
source "${_EIP_LIB}/require.sh"

require_docker || exit 1

if docker network inspect "${NETWORK_NAME}" >/dev/null 2>&1; then
  driver="$(docker network inspect -f '{{.Driver}}' "${NETWORK_NAME}" 2>/dev/null || echo unknown)"
  echo "Network '${NETWORK_NAME}' already exists (driver=${driver})."
  exit 0
fi

echo "Creating external bridge network '${NETWORK_NAME}'..."
docker network create --driver bridge "${NETWORK_NAME}"
echo "Created '${NETWORK_NAME}'. Before Swarm stack deploy, convert to attachable overlay — see docs/swarm/NETWORK.md."
