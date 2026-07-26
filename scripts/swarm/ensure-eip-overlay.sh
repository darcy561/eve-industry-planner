#!/bin/bash
# Convert external network (default eip-core) to an attachable overlay for Swarm.
# Refuses to proceed if any containers are still attached.
#
# See docs/swarm/NETWORK.md and docs/swarm/STACK.md.

set -euo pipefail

_EIP_LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")/../lib" && pwd)"
# shellcheck source=lib/paths.sh
source "${_EIP_LIB}/paths.sh"
# shellcheck source=lib/require.sh
source "${_EIP_LIB}/require.sh"

require_docker || exit 1

if [ "$(swarm_local_state)" != "active" ]; then
  echo "Swarm is not active (LocalNodeState=$(swarm_local_state))."
  echo "Run once: docker swarm init"
  exit 1
fi

if docker network inspect "${NETWORK_NAME}" >/dev/null 2>&1; then
  driver="$(docker network inspect -f '{{.Driver}}' "${NETWORK_NAME}")"
  if [ "${driver}" = "overlay" ]; then
    attachable="$(docker network inspect -f '{{.Attachable}}' "${NETWORK_NAME}")"
    echo "Network '${NETWORK_NAME}' already overlay (attachable=${attachable})."
    if [ "${attachable}" != "true" ]; then
      echo "Error: overlay exists but is not attachable; recreate manually." >&2
      exit 1
    fi
    exit 0
  fi

  containers="$(docker network inspect -f '{{range .Containers}}{{.Name}} {{end}}' "${NETWORK_NAME}" | xargs || true)"
  if [ -n "${containers}" ]; then
    echo "Error: network '${NETWORK_NAME}' still has containers attached:" >&2
    echo "  ${containers}" >&2
    echo "Stop Compose/stack services on ${NETWORK_NAME} first, then re-run." >&2
    exit 1
  fi

  echo "Removing bridge network '${NETWORK_NAME}' to recreate as attachable overlay..."
  docker network rm "${NETWORK_NAME}"
fi

echo "Creating attachable overlay network '${NETWORK_NAME}'..."
docker network create --driver overlay --attachable "${NETWORK_NAME}"
echo "Created '${NETWORK_NAME}' (overlay, attachable). Continue with make up (or make release after .env is ready)."
