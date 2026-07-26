#!/usr/bin/env bash
# Deploy Swarm stack (data → provision → data+app). Obs addon: docker-stack.obs.yml (not here yet).
# Live (default): docker-stack.yml with GHCR ${APP_VERSION}.
# Dev (--dev): merge docker-stack.dev.yml local bake tags.
#
# Quiet by default. EIP_VERBOSE=1 for image lists, expand steps, docker CLI detail.

set -euo pipefail

_EIP_LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")/../lib" && pwd)"
# shellcheck source=lib/root.sh
source "${_EIP_LIB}/root.sh"
# shellcheck source=lib/require.sh
source "${_EIP_LIB}/require.sh"
# shellcheck source=lib/env.sh
source "${_EIP_LIB}/env.sh"
# shellcheck source=lib/images.sh
source "${_EIP_LIB}/images.sh"
# shellcheck source=lib/stack-expand.sh
source "${_EIP_LIB}/stack-expand.sh"
# shellcheck source=lib/s3.sh
source "${_EIP_LIB}/s3.sh"
# shellcheck source=lib/secrets.sh
source "${_EIP_LIB}/secrets.sh"
# shellcheck source=lib/configs.sh
source "${_EIP_LIB}/configs.sh"
# shellcheck source=lib/compose-leftovers.sh
source "${_EIP_LIB}/compose-leftovers.sh"
eip_cd_root

SKIP_PROVISION=0
DEV_MODE=0
for arg in "$@"; do
  case "${arg}" in
    --skip-provision) SKIP_PROVISION=1 ;;
    --dev) DEV_MODE=1 ;;
    -h|--help)
      echo "Usage: $0 [--dev] [--skip-provision]"
      echo "  default: live GHCR images (APP_VERSION from .env)"
      echo "  --dev:    merge ${APP_STACK_DEV_FILE} (requires bake-local / .eip-local-build.env)"
      echo "  EIP_VERBOSE=1 for detailed deploy logs"
      exit 0
      ;;
  esac
done

require_file "${APP_STACK_FILE}" || exit 1
require_file "${DATA_STACK_FILE}" || exit 1
require_file "${ENV_FILE}" "missing ${ENV_FILE} (needed to expand env into the stack spec)" || exit 1
require_docker || exit 1
require_swarm_active || exit 1
require_eip_overlay || exit 1

eip_vlog "Stack expand will regenerate capacity/ports bridges from eip.config (ephemeral sync-env)"

if [ "${DEV_MODE}" -eq 1 ]; then
  require_file "${APP_STACK_DEV_FILE}" || exit 1
  require_local_build_env || exit 1
  # Bake tags must come from the file (not only shell export) for compose interpolate.
  STACK_EXPAND_EXTRA_ENV_FILES=("${LOCAL_BUILD_ENV_FILE}")
  if eip_verbose; then
    print_dev_stack_images
  fi
else
  APP_VERSION="$(resolve_app_version --required)" || exit 1
  export APP_VERSION
  if eip_verbose; then
    print_live_stack_images
  fi
fi

mode_label=live
[ "${DEV_MODE}" -eq 1 ] && mode_label=dev
eip_log "Deploying stack ${STACK_NAME} (${mode_label})…"

docker volume create eve-industry-planner_traefik_data >/dev/null 2>&1 || true
docker volume create eve-industry-planner_api_data >/dev/null 2>&1 || true
docker volume create eve-industry-planner_worker_data >/dev/null 2>&1 || true
docker volume create eve-industry-planner_core_data >/dev/null 2>&1 || true
ensure_data_volumes

eip_vlog "Syncing Swarm secrets from ${ENV_FILE}…"
sync_swarm_secrets
require_file "${SWARM_SECRETS_FILE}" || exit 1

eip_vlog "Syncing Swarm file configs…"
sync_swarm_configs

TMP_DATA="$(mktemp)"
TMP_APP="$(mktemp)"
# shellcheck disable=SC2064
trap 'rm -f "${TMP_DATA}" "${TMP_APP}"' EXIT

eip_vlog "Resolving ${DATA_STACK_FILE}…"
expand_stack_files "${TMP_DATA}" "${DATA_STACK_FILE}"
# Overlay supplies hashed external configs; drop inline file: block from expand.
eip_strip_stack_configs_block "${TMP_DATA}"
if [ "${DEV_MODE}" -eq 1 ]; then
  eip_vlog "Resolving ${APP_STACK_FILE} + ${APP_STACK_DEV_FILE}…"
  expand_stack_files "${TMP_APP}" "${APP_STACK_FILE}" "${APP_STACK_DEV_FILE}"
else
  eip_vlog "Resolving ${APP_STACK_FILE}…"
  expand_stack_files "${TMP_APP}" "${APP_STACK_FILE}"
fi
# Overlay supplies hashed external secrets; drop inline secrets from expand.
eip_strip_stack_secrets "${TMP_APP}"

# Orphans can't be `compose rm`'d once removed from YAML — use project labels only.
eip_remove_migrated_compose_leftovers
docker service rm eip_traefik_spike 2>/dev/null || true

CONFIG_ARGS=()
eip_append_swarm_configs_args CONFIG_ARGS

# Data-only pass: never --prune (would delete api/frontend/… until the full pass).
eip_vlog "Deploying data-layer fragment…"
eip_docker_stack_deploy -c "${TMP_DATA}" "${CONFIG_ARGS[@]}" "${STACK_NAME}"

if [ "${SKIP_PROVISION}" -eq 0 ]; then
  ./scripts/swarm/provision-s3.sh
else
  eip_vlog "Skipping S3 provision (--skip-provision)"
fi

# Full desired state. --prune removes Swarm services dropped from the YAML
# (Compose-style orphans do not exist on Swarm without this flag).
eip_vlog "Deploying data + app + secrets fragments…"
eip_docker_stack_deploy --prune -c "${TMP_DATA}" -c "${TMP_APP}" -c "${SWARM_SECRETS_FILE}" "${CONFIG_ARGS[@]}" "${STACK_NAME}"

# Best-effort: only logs when an unused eip_<KEY>_* object is actually removed.
eip_prune_stale_swarm_secrets || true

if [ "${DEV_MODE}" -eq 1 ]; then
  write_stack_mode dev
else
  write_stack_mode live
fi
eip_log "Done (mode=$(read_stack_mode)). Run: make status"
