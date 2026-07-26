#!/usr/bin/env bash
# make swarm-secrets-sync: refresh Swarm elastic secrets from .env.
# Creates/updates docker secret objects + rematerializes the stack.
# Does NOT apply eip.config.yaml (use make swarm-sync for that).
# Does NOT bounce data-layer services (mongo/redis/nats).
#
# Usage:
#   ./scripts/swarm/swarm-secrets-sync.sh
#   ./scripts/swarm/swarm-secrets-sync.sh --dry-run

set -euo pipefail

_EIP_LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")/../lib" && pwd)"
# shellcheck source=lib/root.sh
source "${_EIP_LIB}/root.sh"
# shellcheck source=lib/require.sh
source "${_EIP_LIB}/require.sh"
# shellcheck source=lib/images.sh
source "${_EIP_LIB}/images.sh"
# shellcheck source=lib/secrets.sh
source "${_EIP_LIB}/secrets.sh"
eip_cd_root

DRY_RUN=0
for arg in "$@"; do
  case "${arg}" in
    --dry-run|-n) DRY_RUN=1 ;;
    -h|--help)
      echo "Usage: $0 [--dry-run]"
      echo "  Sync curated .env secrets → docker secret objects, then stack-deploy"
      echo "  so eip_api / websocket / worker / ws-router / core remount /run/secrets."
      echo "  Not YAML config — use make swarm-sync for that."
      exit 0
      ;;
  esac
done

require_file "${ENV_FILE}" || exit 1
require_docker || exit 1
require_swarm_active || exit 1

eip_log "Syncing secrets from ${ENV_FILE}…"
eip_vlog "(operator YAML / ports/paths: make swarm-sync — different command)"

if [ "${DRY_RUN}" -eq 1 ]; then
  sync_swarm_secrets --dry-run
  PRESERVE=()
  # shellcheck disable=SC2207
  PRESERVE=($(stack_deploy_preserve_args))
  echo "dry-run: would then run ./scripts/swarm/stack-deploy.sh ${PRESERVE[*]:-}"
  exit 0
fi

# stack-deploy calls sync_swarm_secrets + prune after deploy — do not sync twice here.
PRESERVE=()
# shellcheck disable=SC2207
PRESERVE=($(stack_deploy_preserve_args))
exec ./scripts/swarm/stack-deploy.sh "${PRESERVE[@]}"
