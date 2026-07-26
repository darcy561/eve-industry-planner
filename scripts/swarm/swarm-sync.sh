#!/bin/bash
# make swarm-sync: apply operator YAML with targeted Swarm updates.
# Does NOT bounce data-layer services (mongo/redis/nats). Does NOT rewrite the whole stack.
# Capacity: services labeled eip.capacity.sync=1 in docker-stack.yml (api/websocket/worker;
# not ws-router). Traefik ports/paths + Grafana path when those differ. File configs via
# eip.config.sync (scripts/lib/configs.sh).
#
# Escape hatch (full rematerialize): ./scripts/swarm/swarm-sync.sh --full-stack
#
# Usage:
#   ./scripts/swarm/swarm-sync.sh
#   ./scripts/swarm/swarm-sync.sh --dry-run
#   EIP_CONFIG_FILE=eip.config.yaml ./scripts/swarm/swarm-sync.sh

set -euo pipefail

_EIP_LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")/../lib" && pwd)"
# shellcheck source=lib/root.sh
source "${_EIP_LIB}/root.sh"
# shellcheck source=lib/paths.sh
source "${_EIP_LIB}/paths.sh"
# shellcheck source=lib/eip-config.sh
source "${_EIP_LIB}/eip-config.sh"
# shellcheck source=lib/images.sh
source "${_EIP_LIB}/images.sh"
# shellcheck source=lib/configs.sh
source "${_EIP_LIB}/configs.sh"
eip_cd_root

DRY_RUN=0
FULL_STACK=0
for arg in "$@"; do
  case "${arg}" in
    --dry-run|-n) DRY_RUN=1 ;;
    --full-stack) FULL_STACK=1 ;;
    -h|--help)
      echo "Usage: $0 [--dry-run] [--full-stack]"
      echo "  default: targeted docker service update (diff only)"
      echo "  --full-stack: legacy stack-deploy rematerialize (rolls all stack services)"
      exit 0
      ;;
  esac
done

resolve_eip_config --allow-example || exit 1

echo "Validating ${EIP_CONFIG_FILE}…"
eipconfig_run validate

echo "Effective policy:"
eipconfig_run summary

if [ "${FULL_STACK}" -eq 1 ]; then
  PRESERVE=()
  # shellcheck disable=SC2207
  PRESERVE=($(stack_deploy_preserve_args))
  if [ "${DRY_RUN}" -eq 1 ]; then
    echo "Dry-run --full-stack: would run stack-deploy ${PRESERVE[*]:-} (sync-env regenerated at expand)"
    eipconfig_run sync-env
    exit 0
  fi
  echo "WARN: --full-stack rematerializes the entire Swarm stack (may roll all services)." >&2
  exec ./scripts/swarm/stack-deploy.sh "${PRESERVE[@]}"
fi

SYNC_TMP="$(eip_sync_env_temp)" || exit 1
# shellcheck disable=SC2064
trap 'rm -f "${SYNC_TMP}"' EXIT
export EIP_SYNC_ENV_FILE="${SYNC_TMP}"

APPLY_ARGS=(apply)
if [ "${DRY_RUN}" -eq 1 ]; then
  APPLY_ARGS+=(--dry-run)
fi
echo "Applying targeted diffs (eip.capacity.sync + traefik ports/paths + grafana path)…"
echo "(APP_VERSION Redis advertise is NOT part of swarm-sync — use make release / make dev-release / make advertise)"
eipconfig_run "${APPLY_ARGS[@]}"

echo "Applying Swarm file-config hash diffs (eip.config.sync)…"
if [ "${DRY_RUN}" -eq 1 ]; then
  apply_swarm_configs --dry-run
else
  apply_swarm_configs
fi
