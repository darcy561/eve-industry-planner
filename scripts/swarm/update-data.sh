#!/usr/bin/env bash
# make update-data SERVICE=<name>
# Update one data-layer Swarm service without running the app train.

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
# shellcheck source=lib/data-fragment.sh
source "${_EIP_LIB}/data-fragment.sh"
# shellcheck source=lib/s3.sh
source "${_EIP_LIB}/s3.sh"
# shellcheck source=lib/configs.sh
source "${_EIP_LIB}/configs.sh"
eip_cd_root

SERVICE="${SERVICE:-}"
DRY_RUN=0
for arg in "$@"; do
  case "${arg}" in
    --dry-run|-n) DRY_RUN=1 ;;
    -h|--help)
      echo "Usage: SERVICE=seaweedfs|prometheus $0 [--dry-run]"
      echo "  Data-layer services:"
      data_layer_services | sed 's/^/    /'
      exit 0
      ;;
  esac
done

if [ -z "${SERVICE}" ]; then
  echo "Error: set SERVICE=<data-layer service> (e.g. SERVICE=seaweedfs or SERVICE=prometheus)" >&2
  data_layer_services | sed 's/^/  /' >&2
  exit 1
fi

if ! is_data_layer_service "${SERVICE}"; then
  echo "Error: '${SERVICE}' is not a data-layer service (see services: in ${DATA_STACK_FILE})" >&2
  exit 1
fi

NAME="${STACK_NAME}_${SERVICE}"

require_file "${ENV_FILE}" || exit 1

APP_VERSION="$(resolve_app_version --default 0.0.0)"
export APP_VERSION

if [ "${DRY_RUN}" -eq 1 ]; then
  echo "dry-run: sync_swarm_configs + stack deploy data+app fragments (keep membership)"
  echo "dry-run: docker service update --force ${NAME}"
  if [ "${SERVICE}" = "seaweedfs" ]; then
    echo "dry-run: ./scripts/swarm/provision-s3.sh"
  fi
  exit 0
fi

if [ ! -f "${APP_STACK_FILE}" ] || [ ! -f "${DATA_STACK_FILE}" ]; then
  echo "Error: missing stack fragments" >&2
  exit 1
fi

ensure_data_volumes
sync_swarm_configs
TMP_DATA="$(mktemp)"
TMP_APP="$(mktemp)"
# shellcheck disable=SC2064
trap 'rm -f "${TMP_DATA}" "${TMP_APP}"' EXIT
expand_stack_files "${TMP_DATA}" "${DATA_STACK_FILE}"
eip_strip_stack_configs_block "${TMP_DATA}"

# Keep app image source (live GHCR vs #dev bake tags) when rematerializing for membership.
MODE="$(read_stack_mode)"
if [ "${MODE}" = "dev" ]; then
  require_local_build_env || exit 1
  STACK_EXPAND_EXTRA_ENV_FILES=("${LOCAL_BUILD_ENV_FILE}")
  echo "Refreshing stack (mode=dev) from data + ${APP_STACK_FILE} + ${APP_STACK_DEV_FILE}…"
  expand_stack_files "${TMP_APP}" "${APP_STACK_FILE}" "${APP_STACK_DEV_FILE}"
else
  echo "Refreshing stack (mode=live) from data + ${APP_STACK_FILE}…"
  expand_stack_files "${TMP_APP}" "${APP_STACK_FILE}"
fi

CONFIG_ARGS=()
eip_append_swarm_configs_args CONFIG_ARGS
docker stack deploy -c "${TMP_DATA}" -c "${TMP_APP}" "${CONFIG_ARGS[@]}" "${STACK_NAME}"

if ! docker service inspect "${NAME}" >/dev/null 2>&1; then
  echo "Error: service ${NAME} missing after deploy" >&2
  exit 1
fi

echo "Forcing update of ${NAME}…"
docker service update --detach --force "${NAME}"

if [ "${SERVICE}" = "seaweedfs" ]; then
  ./scripts/swarm/provision-s3.sh
fi

echo "Done: ${NAME}"
