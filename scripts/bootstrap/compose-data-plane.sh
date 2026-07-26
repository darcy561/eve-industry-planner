#!/usr/bin/env bash
# Formerly Compose data-plane up. Swarm owns data + obs now — this is a no-op
# kept so older Makefile/docs calls do not fail.
#
# Usage: ./scripts/bootstrap/compose-data-plane.sh up|up-dev|restart-alloy

set -euo pipefail

_EIP_LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")/../lib" && pwd)"
# shellcheck source=../lib/root.sh
source "${_EIP_LIB}/root.sh"
# shellcheck source=../lib/paths.sh
source "${_EIP_LIB}/paths.sh"
eip_cd_root

cmd="${1:-}"
case "${cmd}" in
  up | up-dev)
    echo "compose-data-plane: skipped (Swarm data fragment: ${DATA_STACK_FILE})"
    ;;
  restart-alloy)
    # Prefer Swarm service roll when obs is deployed.
    if docker service inspect "${STACK_NAME}_alloy" >/dev/null 2>&1; then
      echo "Forcing update of ${STACK_NAME}_alloy (reload discovery / config)…"
      docker service update --detach --force "${STACK_NAME}_alloy" >/dev/null
    else
      echo "compose-data-plane: no ${STACK_NAME}_alloy service (obs addon not deployed)"
    fi
    ;;
  -h | --help | "")
    echo "Usage: $0 up|up-dev|restart-alloy"
    echo "  up/up-dev are no-ops; data plane is Swarm (${DATA_STACK_FILE})."
    exit 0
    ;;
  *)
    echo "Usage: $0 up|up-dev|restart-alloy" >&2
    exit 1
    ;;
esac
