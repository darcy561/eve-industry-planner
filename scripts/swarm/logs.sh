#!/usr/bin/env bash
# make logs — show logs for a service (menu) or SERVICE= / all.
# Extra docker log flags: ARGS='-f' ARGS='--tail=200' etc.

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

# ARGS from make may be unquoted words; also accept CLI flags after --
LOG_ARGS=()
if [ -n "${ARGS:-}" ]; then
  # Make passes ARGS as one string; split on IFS whitespace.
  # shellcheck disable=SC2206
  LOG_ARGS=(${ARGS})
fi
TARGET="${SERVICE:-}"

while [ $# -gt 0 ]; do
  case "$1" in
    --)
      shift
      LOG_ARGS+=("$@")
      break
      ;;
    -h|--help)
      echo "Usage: make logs"
      echo "       make logs SERVICE=api"
      echo "       make logs SERVICE=all ARGS='--tail=200'"
      echo "       make logs SERVICE=api ARGS='-f'"
      echo "  Follow (-f) works for one service; not for all at once."
      exit 0
      ;;
    -*)
      LOG_ARGS+=("$1")
      shift
      ;;
    *)
      if [ -z "${TARGET}" ]; then
        TARGET="$1"
      else
        LOG_ARGS+=("$1")
      fi
      shift
      ;;
  esac
done

if [ "${#LOG_ARGS[@]}" -eq 0 ]; then
  LOG_ARGS=(--tail=100)
fi

log_args_follow() {
  local a
  for a in "${LOG_ARGS[@]}"; do
    case "${a}" in
      -f|--follow) return 0 ;;
    esac
  done
  return 1
}

show_one() {
  local short="$1"
  if ! eip_resolve_service "${short}"; then
    echo "Error: unknown or not running service '${short}'" >&2
    return 1
  fi
  echo "=== logs: ${EIP_SVC_SHORT} ===" >&2
  # Aggregates all running tasks for the service.
  docker service logs "${LOG_ARGS[@]}" "${EIP_SVC_FULL}" 2>&1 || true
}

show_all() {
  local short
  local any=0
  if log_args_follow; then
    echo "Error: follow (-f) cannot be used with all services at once." >&2
    echo "Pick one service from the menu, or: make logs SERVICE=api ARGS='-f'" >&2
    return 1
  fi
  while IFS= read -r short; do
    [ -n "${short}" ] || continue
    any=1
    show_one "${short}" || true
    echo "" >&2
  done < <(eip_list_running_services)
  if [ "${any}" -eq 0 ]; then
    echo "Error: nothing is running. Start the app with: make up" >&2
    return 1
  fi
}

if [ -z "${TARGET}" ]; then
  TARGET="$(eip_pick_service --all)" || exit 1
fi

case "${TARGET}" in
  all|ALL)
    show_all
    ;;
  *)
    show_one "${TARGET}"
    ;;
esac
