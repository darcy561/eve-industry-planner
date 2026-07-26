#!/usr/bin/env bash
# make shutdown — stop the app completely; keep volumes / data.

set -euo pipefail

_EIP_LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")/../lib" && pwd)"
# shellcheck source=lib/root.sh
source "${_EIP_LIB}/root.sh"
# shellcheck source=lib/require.sh
source "${_EIP_LIB}/require.sh"
# shellcheck source=lib/services.sh
source "${_EIP_LIB}/services.sh"
# shellcheck source=lib/compose.sh
source "${_EIP_LIB}/compose.sh"
eip_cd_root

require_docker || exit 1

YES=0
for arg in "$@"; do
  case "${arg}" in
    -y|--yes) YES=1 ;;
    -h|--help)
      echo "Usage: make shutdown"
      echo "  Stops the app. Your data is kept. Start again with: make up"
      exit 0
      ;;
  esac
done

if [ "${YES}" -ne 1 ]; then
  eip_confirm "Stop the app completely. Your data is kept. You will need make up to start again." || exit 1
fi

echo "Stopping the app…"

if eip_stack_exists; then
  echo "  removing stack ${STACK_NAME}"
  docker stack rm "${STACK_NAME}"
  eip_wait_stack_gone 120 || true
fi

# Best-effort: remove leftover Compose project containers from pre-Swarm installs.
eip_compose_with_files "${COMPOSE_BASE}" -- down --remove-orphans 2>/dev/null || true

echo "Done. Start again with: make up"
