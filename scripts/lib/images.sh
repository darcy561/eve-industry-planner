# shellcheck shell=bash
# App image names: GHCR (live stack) vs local bake tags (dev overlay).
# Service lists and image repos come from docker-stack.dev.yml / docker-stack.yml
# — not a hardcoded role table.

# shellcheck source=paths.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/paths.sh"
# shellcheck source=env.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/env.sh"
# shellcheck source=yaml-services.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/yaml-services.sh"

# Stable tag bake writes first; per-role unique tags applied only when that role's digest changes.
BAKE_WORKING_TAG="${EIP_BAKE_WORKING_TAG:-bake}"

# Per-role promoted tags / digests. Populated by load_local_build_env / bake-local.
declare -A ROLE_TAGS=()
declare -A BAKE_DIGESTS=()

# Bakeable / #dev-overlay Swarm app services (from docker-stack.dev.yml).
dev_app_services() {
  yaml_top_level_services "${APP_STACK_DEV_FILE}"
}

is_dev_app_service() {
  local want="$1" s
  while IFS= read -r s; do
    [ -z "${s}" ] && continue
    [ "${s}" = "${want}" ] && return 0
  done < <(dev_app_services)
  return 1
}

# Swarm services that are not bakeable (#dev overlay): app pinned (e.g. traefik)
# or observability fragment roles.
is_swarm_pinned_service() {
  local want="$1" s
  is_dev_app_service "${want}" && return 1
  while IFS= read -r s; do
    [ -z "${s}" ] && continue
    [ "${s}" = "${want}" ] && return 0
  done < <(yaml_top_level_services "${APP_STACK_FILE}")
  while IFS= read -r s; do
    [ -z "${s}" ] && continue
    [ "${s}" = "${want}" ] && return 0
  done < <(yaml_top_level_services "${OBS_STACK_FILE}")
  return 1
}

# Env-safe key for TAG_* / DIGEST_* (ws-router → ws_router).
role_env_key() {
  printf '%s\n' "$1" | tr '-' '_'
}

# Image repository (no tag) from docker-stack.dev.yml for a service.
dev_image_repo() {
  local role="$1" img
  img="$(yaml_service_image "${APP_STACK_DEV_FILE}" "${role}")"
  if [ -z "${img}" ]; then
    echo ""
    return 0
  fi
  # eve-industry-planner-api:${TAG_api} → eve-industry-planner-api
  printf '%s\n' "${img%%:*}"
}

# Live/GHCR image for a service from docker-stack.yml, with APP_VERSION substituted.
ghcr_image() {
  local role="$1" ver="$2" img
  img="$(yaml_service_image "${APP_STACK_FILE}" "${role}")"
  if [ -z "${img}" ]; then
    echo ""
    return 0
  fi
  img="${img//\$\{APP_VERSION\}/${ver}}"
  printf '%s\n' "${img}"
}

# Image pin for a Swarm service from app or obs stack YAML.
stack_pinned_image() {
  local role="$1" img
  img="$(yaml_service_image "${APP_STACK_FILE}" "${role}")"
  if [ -n "${img}" ]; then
    printf '%s\n' "${img}"
    return 0
  fi
  yaml_service_image "${OBS_STACK_FILE}" "${role}"
}

traefik_image() {
  stack_pinned_image traefik
}

local_app_image() {
  local role="$1" tag="$2" repo
  repo="$(dev_image_repo "${role}")"
  if [ -z "${repo}" ]; then
    echo ""
    return 0
  fi
  printf '%s:%s\n' "${repo}" "${tag}"
}

# Dev image for a role: uses ROLE_TAGS[role] (from .eip-local-build.env).
dev_image() {
  # Split locals: bash expands ${role} in the same `local` line before assignment
  # (breaks under set -u on Win/macOS/Linux Git Bash).
  local role="$1"
  local tag="${ROLE_TAGS[${role}]:-}"
  if [ -z "${tag}" ]; then
    echo ""
    return 0
  fi
  local_app_image "${role}" "${tag}"
}

bake_working_image() {
  local_app_image "$1" "${BAKE_WORKING_TAG}"
}

# Expand bake CLI targets. Group name "swarm" = all #dev-overlay services.
expand_bake_roles() {
  local t
  for t in "$@"; do
    if [ "${t}" = "swarm" ]; then
      dev_app_services
      continue
    fi
    if is_dev_app_service "${t}"; then
      printf '%s\n' "${t}"
    else
      echo "Error: '${t}' is not a bakeable #dev-overlay service (see ${APP_STACK_DEV_FILE})" >&2
      return 1
    fi
  done
}

new_local_build_id() {
  date +%Y%m%d%H%M%S
}

# Content identity for a local image ref (Docker CLI only — Win/macOS/Linux;
# no python/node/jq). Prefer RepoDigests when present; otherwise Id.
image_digest() {
  local ref="$1" d
  d="$(docker image inspect "${ref}" --format '{{if .RepoDigests}}{{index .RepoDigests 0}}{{end}}' 2>/dev/null || true)"
  if [ -n "${d}" ]; then
    printf '%s\n' "${d#*@}"
    return 0
  fi
  docker image inspect "${ref}" --format '{{.Id}}' 2>/dev/null || echo "missing"
}

# Digest of the stable :bake working image for a role (after docker buildx bake).
bake_working_digest() {
  image_digest "$(bake_working_image "$1")"
}

export_role_tag_env() {
  local role key
  while IFS= read -r role; do
    [ -z "${role}" ] && continue
    if [ -n "${ROLE_TAGS[${role}]:-}" ]; then
      key="$(role_env_key "${role}")"
      export "TAG_${key}=${ROLE_TAGS[${role}]}"
    fi
  done < <(dev_app_services)
}

write_local_build_env() {
  local out="${1:-${LOCAL_BUILD_ENV_FILE}}"
  local role key dig tag
  {
    printf 'APP_VERSION=%s\n' "${APP_VERSION}"
    while IFS= read -r role; do
      [ -z "${role}" ] && continue
      key="$(role_env_key "${role}")"
      tag="${ROLE_TAGS[${role}]:-}"
      dig="${BAKE_DIGESTS[${role}]:-}"
      if [ -n "${tag}" ]; then
        printf 'TAG_%s=%s\n' "${key}" "${tag}"
      fi
      if [ -n "${dig}" ]; then
        printf 'DIGEST_%s=%s\n' "${key}" "${dig}"
      fi
    done < <(dev_app_services)
  } >"${out}"
}

load_local_build_env() {
  local f="${1:-${LOCAL_BUILD_ENV_FILE}}"
  local role key tag dig legacy_id legacy_tag
  [ -f "${f}" ] || return 1
  APP_VERSION="$(read_env_key "${f}" APP_VERSION)"
  if [ -z "${APP_VERSION}" ]; then
    return 1
  fi
  ROLE_TAGS=()
  BAKE_DIGESTS=()
  while IFS= read -r role; do
    [ -z "${role}" ] && continue
    key="$(role_env_key "${role}")"
    tag="$(read_env_key "${f}" "TAG_${key}")"
    if [ -n "${tag}" ]; then
      ROLE_TAGS["${role}"]="${tag}"
    fi
    dig="$(read_env_key "${f}" "DIGEST_${key}")"
    if [ -n "${dig}" ]; then
      BAKE_DIGESTS["${role}"]="${dig}"
    fi
  done < <(dev_app_services)
  # Migrate legacy single LOCAL_BUILD_ID / IMAGE_TAG → per-role TAG_*.
  if [ "${#ROLE_TAGS[@]}" -eq 0 ]; then
    legacy_id="$(read_env_key "${f}" LOCAL_BUILD_ID)"
    legacy_tag="$(read_env_key "${f}" IMAGE_TAG)"
    if [ -z "${legacy_tag}" ] && [ -n "${legacy_id}" ]; then
      legacy_tag="${APP_VERSION}-${legacy_id}"
    fi
    if [ -n "${legacy_tag}" ]; then
      while IFS= read -r role; do
        [ -z "${role}" ] && continue
        ROLE_TAGS["${role}"]="${legacy_tag}"
      done < <(dev_app_services)
    fi
  fi
  if [ "${#ROLE_TAGS[@]}" -eq 0 ]; then
    return 1
  fi
  export APP_VERSION
  export_role_tag_env
}

require_local_build_env() {
  if [ -f "${LOCAL_BUILD_ENV_FILE}" ]; then
    load_local_build_env || return 1
    return 0
  fi
  echo "Error: missing ${LOCAL_BUILD_ENV_FILE} — run scripts/swarm/bake-local.sh first" >&2
  return 1
}

write_stack_mode() {
  printf '%s\n' "$1" >"${STACK_MODE_FILE}"
}

read_stack_mode() {
  local m=""
  if [ -f "${STACK_MODE_FILE}" ]; then
    m="$(tr -d '[:space:]' <"${STACK_MODE_FILE}")"
  fi
  if [ "${m}" = "dev" ]; then
    echo "dev"
  else
    echo "live"
  fi
}

stack_deploy_preserve_args() {
  if [ "$(read_stack_mode)" = "dev" ]; then
    echo "--dev"
  fi
}

print_live_stack_images() {
  local role img
  echo "Stack images (live Swarm):"
  while IFS= read -r role; do
    [ -z "${role}" ] && continue
    if is_dev_app_service "${role}"; then
      img="$(ghcr_image "${role}" "${APP_VERSION}")"
    else
      img="$(stack_pinned_image "${role}")"
    fi
    echo "  ${role}: ${img}"
  done < <(yaml_top_level_services "${APP_STACK_FILE}")
}

print_dev_stack_images() {
  local role
  echo "Stack images (dev — bake tags + pinned Swarm images):"
  while IFS= read -r role; do
    [ -z "${role}" ] && continue
    if is_dev_app_service "${role}"; then
      echo "  ${role}: $(dev_image "${role}")"
    else
      echo "  ${role}: $(stack_pinned_image "${role}")"
    fi
  done < <(yaml_top_level_services "${APP_STACK_FILE}")
}
