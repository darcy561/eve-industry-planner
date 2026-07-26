# shellcheck shell=bash
# Docker / Swarm / eip network gates.

# shellcheck source=paths.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/paths.sh"

require_file() {
  local path="$1"
  local msg="${2:-missing ${path}}"
  if [ ! -f "${path}" ]; then
    echo "Error: ${msg}" >&2
    return 1
  fi
}

require_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "Error: docker is required" >&2
    return 1
  fi
}

swarm_local_state() {
  docker info --format '{{.Swarm.LocalNodeState}}' 2>/dev/null || echo inactive
}

require_swarm_active() {
  local state
  state="$(swarm_local_state)"
  if [ "${state}" != "active" ]; then
    echo "Error: Swarm is not active. Run: make ensure-swarm" >&2
    return 1
  fi
}

# Network exists (any driver).
require_eip_network() {
  if ! docker network inspect "${NETWORK_NAME}" >/dev/null 2>&1; then
    echo "Error: network '${NETWORK_NAME}' missing. Run: make ensure-eip-overlay" >&2
    return 1
  fi
}

# Network exists and is overlay (required for stack deploy). Attachable is ensured by ensure-eip-overlay.
require_eip_overlay() {
  local driver
  require_eip_network || return 1
  driver="$(docker network inspect -f '{{.Driver}}' "${NETWORK_NAME}")"
  if [ "${driver}" != "overlay" ]; then
    echo "Error: network '${NETWORK_NAME}' is driver=${driver}; need overlay. Run: make ensure-eip-overlay" >&2
    return 1
  fi
}
