#!/usr/bin/env bash
# make restart — rolling restart (menu). Same images; never pull/bake/advertise.
#   one service → docker service update --force (start-first wave when configured)
#   all → whole-stack force roll

set -euo pipefail

_EIP_LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")/../lib" && pwd)"
# shellcheck source=lib/root.sh
source "${_EIP_LIB}/root.sh"
# shellcheck source=lib/require.sh
source "${_EIP_LIB}/require.sh"
# shellcheck source=lib/services.sh
source "${_EIP_LIB}/services.sh"
eip_cd_root

require_docker || exit 1

YES=0
TARGET="${SERVICE:-}"
for arg in "$@"; do
  case "${arg}" in
    -y|--yes) YES=1 ;;
    -h|--help)
      echo "Usage: make restart"
      echo "       make restart SERVICE=api"
      echo "       make restart SERVICE=all"
      echo "  Rolling restart. Same version (no download). Does not advertise."
      exit 0
      ;;
    *)
      if [ -z "${TARGET}" ] && [[ "${arg}" != -* ]]; then
        TARGET="${arg}"
      fi
      ;;
  esac
done

restart_one_swarm() {
  local full="$1" short="$2"
  echo "  rolling restart: ${short}"
  docker service update --detach --force "${full}" >/dev/null
}

restart_one() {
  local short="$1"
  if ! eip_resolve_service "${short}"; then
    echo "Error: unknown service '${short}'" >&2
    return 1
  fi
  restart_one_swarm "${EIP_SVC_FULL}" "${EIP_SVC_SHORT}"
}

# Prefer a stable train-ish order, then any other Swarm stack services.
restart_all() {
  local -A done=()
  local short name
  local any=0

  echo "Rolling restart of the whole app (same version, no download)…"

  if eip_stack_exists; then
    for short in "${EIP_RESTART_PREFER[@]}"; do
      name="${STACK_NAME}_${short}"
      if docker service inspect "${name}" >/dev/null 2>&1; then
        restart_one_swarm "${name}" "${short}"
        done["${short}"]=1
        any=1
      fi
    done
    while IFS= read -r name; do
      [ -n "${name}" ] || continue
      short="${name#"${STACK_NAME}"_}"
      if [ -n "${done[${short}]:-}" ]; then
        continue
      fi
      restart_one_swarm "${name}" "${short}"
      done["${short}"]=1
      any=1
    done < <(docker stack services "${STACK_NAME}" --format '{{.Name}}' 2>/dev/null || true)
  fi

  if [ "${any}" -eq 0 ]; then
    echo "Error: nothing is running. Start the app with: make up" >&2
    return 1
  fi
  echo "Done. Check with: make status"
}

if [ -z "${TARGET}" ]; then
  TARGET="$(eip_pick_service --all)" || exit 1
fi

case "${TARGET}" in
  all|ALL)
    if [ "${YES}" -ne 1 ]; then
      eip_confirm "Restart the whole app with a rolling update (same version, no download). The app should stay up." || exit 1
    fi
    restart_all
    ;;
  *)
    if ! eip_resolve_service "${TARGET}"; then
      echo "Error: unknown or not running service '${TARGET}'" >&2
      exit 1
    fi
    if [ "${YES}" -ne 1 ]; then
      eip_confirm "Restart ${EIP_SVC_SHORT} with a rolling update so the app stays up." || exit 1
    fi
    restart_one "${EIP_SVC_SHORT}"
    echo "Done. Check with: make status"
    ;;
esac
