#!/usr/bin/env bash
# Bake Swarm app images via buildx.
#
# 1) Bake to a stable working tag (:bake)
# 2) Compare docker image digest of :bake to last promoted DIGEST_* per role
# 3) Only roles whose digest changed get a new TAG_* — unchanged roles keep their
#    previous tag so Swarm does not roll them
#
# Digests via `docker image inspect` only (Windows / macOS / Linux; no python/node/jq).
# --no-cache = ignore BuildKit cache while building; it does not force promote/roll.
#
# Usage:
#   ./scripts/swarm/bake-local.sh              # group "swarm"
#   ./scripts/swarm/bake-local.sh api worker   # subset
#   ./scripts/swarm/bake-local.sh --no-cache
#   ./scripts/swarm/bake-local.sh --dry-run api

set -euo pipefail

_EIP_LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")/../lib" && pwd)"
# shellcheck source=lib/root.sh
source "${_EIP_LIB}/root.sh"
# shellcheck source=lib/env.sh
source "${_EIP_LIB}/env.sh"
# shellcheck source=lib/images.sh
source "${_EIP_LIB}/images.sh"
eip_cd_root

# Embedded SoT lives in admintool/internal/images; prefer eip rebuild.
BAKE_FILE="${EIP_BAKE_FILE:-admintool/internal/images/docker-bake.hcl}"

NO_CACHE=0
DRY_RUN=0
TARGETS=()

for arg in "$@"; do
  case "${arg}" in
    --no-cache) NO_CACHE=1 ;;
    --dry-run|-n) DRY_RUN=1 ;;
    -h|--help)
      echo "Usage: $0 [--no-cache] [--dry-run] [target...]"
      echo "  default targets: swarm group (api websocket worker ws-router core)"
      echo "  Bakes to :${BAKE_WORKING_TAG}; promotes per-role TAG_* only when"
      echo "  the :bake image digest changes (docker image inspect)."
      exit 0
      ;;
    *) TARGETS+=("${arg}") ;;
  esac
done

if [ "${#TARGETS[@]}" -eq 0 ]; then
  TARGETS=(swarm)
fi

mapfile -t ROLES < <(expand_bake_roles "${TARGETS[@]}" | sort -u)
if [ "${#ROLES[@]}" -eq 0 ]; then
  echo "Error: no bake roles resolved from: ${TARGETS[*]}" >&2
  exit 1
fi

load_kv_file() {
  local f="$1"
  [ -f "${f}" ] || return 0
  while IFS= read -r line || [ -n "${line}" ]; do
    line="${line%$'\r'}"
    case "${line}" in
      ''|\#*) continue ;;
    esac
    if [[ "${line}" =~ ^(ENVIRONMENT|SENTRY_DSN|SENTRY_TRACES_SAMPLE_RATE|SENTRY_ORG|SENTRY_PROJECT_ID|SENTRY_AUTH_TOKEN|SENTRY_ERROR_SAMPLE_RATE|FEEDBACK_DISCORD_WEBHOOK_URL|APP_FEATURE_FLAGS_JSON)=(.*)$ ]]; then
      export "${BASH_REMATCH[1]}=${BASH_REMATCH[2]}"
    fi
  done < "${f}"
}

image_exists() {
  docker image inspect "$1" >/dev/null 2>&1
}

role_in_list() {
  local want="$1" x
  shift
  for x in "$@"; do
    [ "${x}" = "${want}" ] && return 0
  done
  return 1
}

load_kv_file "${ENV_FILE}"

export ENVIRONMENT="${ENVIRONMENT:-development}"
APP_VERSION="$(resolve_app_version --default 0.0.0)"
export APP_VERSION
export FRONTEND_APP_VERSION="${APP_VERSION}"
export APP_FEATURE_FLAGS_JSON="${APP_FEATURE_FLAGS_JSON:-{"enable_upcoming_changes_page":false}}"

export BAKE_WORKING_TAG
declare -A BAKE_DIGESTS=()
declare -A ROLE_TAGS=()
declare -A PREV_TAGS=()
declare -A PREV_DIGESTS=()

if ! docker buildx version >/dev/null 2>&1; then
  echo "Error: docker buildx is required for local Swarm image bake" >&2
  exit 1
fi

BAKE_ARGS=(-f "${BAKE_FILE}")
if [ "${NO_CACHE}" -eq 1 ]; then
  BAKE_ARGS+=(--no-cache)
  eip_vlog "bake: --no-cache (build only; promote still requires digest change)"
fi
if eip_verbose; then
  BAKE_ARGS+=(--progress=plain)
else
  BAKE_ARGS+=(--progress=quiet)
fi
BAKE_ARGS+=("${TARGETS[@]}")

eip_log "Building images (${TARGETS[*]})…"
eip_vlog "bake targets: ${TARGETS[*]} → :${BAKE_WORKING_TAG} (APP_VERSION=${APP_VERSION} ENVIRONMENT=${ENVIRONMENT})"

if [ "${DRY_RUN}" -eq 1 ]; then
  echo "dry-run: docker buildx bake ${BAKE_ARGS[*]}"
  echo "dry-run: would compare :${BAKE_WORKING_TAG} digests to DIGEST_* / promote TAG_* per role"
  exit 0
fi

docker buildx bake "${BAKE_ARGS[@]}"

# Prior per-role state (migrates legacy single-tag env if needed).
if [ -f "${LOCAL_BUILD_ENV_FILE}" ]; then
  load_local_build_env || true
fi
APP_VERSION="$(resolve_app_version --default 0.0.0)"
export APP_VERSION

while IFS= read -r role; do
  [ -z "${role}" ] && continue
  PREV_TAGS["${role}"]="${ROLE_TAGS[${role}]:-}"
  PREV_DIGESTS["${role}"]="${BAKE_DIGESTS[${role}]:-}"
done < <(dev_app_services)

# Digests from this bake for requested roles (docker inspect of :bake — no JSON tools).
for role in "${ROLES[@]}"; do
  dig="$(bake_working_digest "${role}")"
  if [ -z "${dig}" ] || [ "${dig}" = "missing" ]; then
    echo "Error: no image digest for $(bake_working_image "${role}") after bake" >&2
    exit 1
  fi
  BAKE_DIGESTS["${role}"]="${dig}"
done

# Non-baked roles: keep previous tag + digest.
while IFS= read -r role; do
  [ -z "${role}" ] && continue
  role_in_list "${role}" "${ROLES[@]}" && continue
  ROLE_TAGS["${role}"]="${PREV_TAGS[${role}]:-}"
  BAKE_DIGESTS["${role}"]="${PREV_DIGESTS[${role}]:-}"
done < <(dev_app_services)

PROMOTE_ROLES=()
KEEP_COUNT=0
for role in "${ROLES[@]}"; do
  new_dig="${BAKE_DIGESTS[${role}]}"
  old_dig="${PREV_DIGESTS[${role}]:-}"
  old_tag="${PREV_TAGS[${role}]:-}"
  if [ -z "${old_tag}" ]; then
    PROMOTE_ROLES+=("${role}")
    eip_vlog "bake: promote ${role} (no prior TAG)"
    continue
  fi
  if [ -z "${old_dig}" ]; then
    PROMOTE_ROLES+=("${role}")
    eip_vlog "bake: promote ${role} (no prior DIGEST)"
    continue
  fi
  if [ "${new_dig}" != "${old_dig}" ]; then
    PROMOTE_ROLES+=("${role}")
    eip_vlog "bake: promote ${role} (digest changed)"
    eip_vlog "  old ${old_dig}"
    eip_vlog "  new ${new_dig}"
    continue
  fi
  ROLE_TAGS["${role}"]="${old_tag}"
  BAKE_DIGESTS["${role}"]="${old_dig}"
  KEEP_COUNT=$((KEEP_COUNT + 1))
  eip_vlog "bake: keep ${role} tag=${old_tag} (digest unchanged)"
done

if [ "${#PROMOTE_ROLES[@]}" -eq 0 ]; then
  export_role_tag_env
  # Refresh env file timestamps/content without changing tags.
  write_local_build_env
  eip_log "Images unchanged (${KEEP_COUNT} roles)."
  if eip_verbose; then
    while IFS= read -r role; do
      [ -z "${role}" ] && continue
      [ -n "${ROLE_TAGS[${role}]:-}" ] && echo "  $(role_env_key "${role}"): ${ROLE_TAGS[${role}]}"
    done < <(dev_app_services)
  fi
  exit 0
fi

NEW_TAG="${APP_VERSION}-$(new_local_build_id)"
eip_log "Updated images: ${PROMOTE_ROLES[*]} → ${NEW_TAG}"
eip_vlog "bake: promoting ${PROMOTE_ROLES[*]} → :${NEW_TAG}"
for role in "${PROMOTE_ROLES[@]}"; do
  src="$(bake_working_image "${role}")"
  if ! image_exists "${src}"; then
    echo "Error: missing working image ${src}" >&2
    exit 1
  fi
  ROLE_TAGS["${role}"]="${NEW_TAG}"
  dst="$(local_app_image "${role}" "${NEW_TAG}")"
  docker tag "${src}" "${dst}"
  eip_vlog "  tagged ${dst} ← ${src}"
done

export_role_tag_env
write_local_build_env
eip_vlog "bake done. wrote ${LOCAL_BUILD_ENV_FILE}"
if eip_verbose; then
  while IFS= read -r role; do
    [ -z "${role}" ] && continue
    [ -n "${ROLE_TAGS[${role}]:-}" ] && echo "  TAG_$(role_env_key "${role}")=${ROLE_TAGS[${role}]}"
  done < <(dev_app_services)
fi
