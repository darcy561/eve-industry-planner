#!/bin/bash
# make rebuild: build app images (Docker cache) + roll only when needed.
# Does NOT rewrite the whole Swarm stack. Does NOT Redis-advertise.
#
# Default = full app train from docker-stack.dev.yml (api/websocket/worker/ws-router/core/frontend).
#
# SERVICES= may list any Swarm stack service:
#   make rebuild SERVICES=websocket
#   make rebuild SERVICES=core,frontend
#   make rebuild SERVICES=traefik,grafana,alloy
# Data-layer roles → make update-data SERVICE=…
#
# Swarm app images: bake → :bake; promote per-role TAG_* when digest changes;
# roll only when service image ID changed. --roll-only forces.
#
# Build cache: default. --no-cache is opt-in. Version rolls use make dev-release
# / make release (always --no-cache).
#
# make dev remains full bring-up / recovery; prefer rebuild for day-2 code changes.

set -euo pipefail

_EIP_LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")/../lib" && pwd)"
# shellcheck source=lib/root.sh
source "${_EIP_LIB}/root.sh"
# shellcheck source=lib/env.sh
source "${_EIP_LIB}/env.sh"
# shellcheck source=lib/paths.sh
source "${_EIP_LIB}/paths.sh"
# shellcheck source=lib/images.sh
source "${_EIP_LIB}/images.sh"
# shellcheck source=../lib/data-fragment.sh
source "${_EIP_LIB}/data-fragment.sh"
eip_cd_root

# Bakeable Swarm apps from docker-stack.dev.yml.
DEFAULT_APP="$(dev_app_services | paste -sd, -)"

DRY_RUN=0
BUILD_ONLY=0
ROLL_ONLY=0
NO_CACHE=0
for arg in "$@"; do
  case "${arg}" in
    --dry-run|-n) DRY_RUN=1 ;;
    --build-only) BUILD_ONLY=1 ;;
    --roll-only) ROLL_ONLY=1 ;;
    --no-cache) NO_CACHE=1 ;;
    -h|--help)
      echo "Usage: $0 [--dry-run] [--build-only|--roll-only] [--no-cache]"
      echo "  Default SERVICES: ${DEFAULT_APP}"
      echo "  SERVICES= may include bakeable Swarm apps (docker-stack.dev.yml),"
      echo "    pinned app/obs roles (e.g. traefik, grafana)."
      echo "  Data-layer: make update-data SERVICE=…"
      echo "  Bakeable Swarm: promote/roll per-role only when digest changes (or --roll-only)."
      exit 0
      ;;
  esac
done

if [ "${BUILD_ONLY}" -eq 1 ] && [ "${ROLL_ONLY}" -eq 1 ]; then
  echo "Error: --build-only and --roll-only are mutually exclusive" >&2
  exit 1
fi

if [ -z "${SERVICES:-}" ]; then
  SERVICES_CSV="${DEFAULT_APP}"
else
  SERVICES_CSV="${SERVICES}"
fi
SERVICES_CSV="$(echo "${SERVICES_CSV}" | tr ',' ' ' | xargs | tr ' ' ',')"
IFS=',' read -r -a SERVICE_LIST <<< "${SERVICES_CSV}"

# Data-layer Swarm services come from docker-stack.data.yml — use make update-data SERVICE=…
for s in "${SERVICE_LIST[@]}"; do
  if is_data_layer_service "${s}"; then
    echo "Error: '${s}' is a data-layer service — use: make update-data SERVICE=${s}" >&2
    exit 1
  fi
done

is_swarm_build() {
  is_dev_app_service "$1"
}

is_swarm_pinned() {
  is_swarm_pinned_service "$1"
}

# Content digest (RepoDigests / Id fallback) — see image_digest in lib/images.sh.
image_id() {
  image_digest "$1"
}

# Digest currently desired by a Swarm service (strip registry digest suffix on the ref).
service_image_id() {
  local name="$1" img
  img="$(docker service inspect "${name}" --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}' 2>/dev/null || true)"
  if [ -z "${img}" ]; then
    echo "missing"
    return
  fi
  img="${img%%@*}"
  image_digest "${img}"
}

SWARM_BUILD_SVCS=()
SWARM_PINNED_SVCS=()

for s in "${SERVICE_LIST[@]}"; do
  s="$(echo "${s}" | xargs)"
  [ -n "${s}" ] || continue
  if is_swarm_build "${s}"; then
    SWARM_BUILD_SVCS+=("${s}")
  elif is_swarm_pinned "${s}"; then
    SWARM_PINNED_SVCS+=("${s}")
  else
    echo "Error: unknown service '${s}'." >&2
    echo "  Swarm (bakeable): $(dev_app_services | paste -sd, -)" >&2
    echo "  Swarm (pinned):   $(yaml_top_level_services "${APP_STACK_FILE}" | while read -r x; do is_dev_app_service "${x}" || echo "${x}"; done | paste -sd, -)" >&2
    echo "  Swarm (obs):      $(yaml_top_level_services "${OBS_STACK_FILE}" | paste -sd, -)" >&2
    echo "  Data-layer:       make update-data SERVICE=…" >&2
    exit 1
  fi
done

echo "rebuild plan: swarm-bake=[${SWARM_BUILD_SVCS[*]:-}] swarm-pinned=[${SWARM_PINNED_SVCS[*]:-}]"

declare -A SWARM_IMAGE_BEFORE=()
for s in "${SWARM_BUILD_SVCS[@]:-}"; do
  [ -n "${s}" ] || continue
  SWARM_IMAGE_BEFORE["${s}"]="$(service_image_id "${STACK_NAME}_${s}")"
done

if [ "${ROLL_ONLY}" -eq 0 ]; then
  if [ "${#SWARM_BUILD_SVCS[@]}" -eq 0 ] \
    && [ "${#SWARM_PINNED_SVCS[@]}" -eq 0 ]; then
    echo "Error: no services selected" >&2
    exit 1
  fi
  if [ "${NO_CACHE}" -eq 1 ]; then
    echo "build: --no-cache (clean bake)"
  else
    echo "build: using Docker cache (default; pass --no-cache for a clean bake)"
  fi
  if [ "${#SWARM_BUILD_SVCS[@]}" -gt 0 ]; then
    echo "Building Swarm images (buildx bake): ${SWARM_BUILD_SVCS[*]}"
    if [ "${DRY_RUN}" -eq 0 ]; then
      BAKE_FLAGS=()
      if [ "${NO_CACHE}" -eq 1 ]; then
        BAKE_FLAGS+=(--no-cache)
      fi
      ./scripts/swarm/bake-local.sh "${BAKE_FLAGS[@]}" "${SWARM_BUILD_SVCS[@]}"
    else
      echo "  dry-run: bake-local.sh ${SWARM_BUILD_SVCS[*]}"
    fi
  fi
fi

if [ "${BUILD_ONLY}" -eq 1 ]; then
  echo "build-only: skipping rolls"
  exit 0
fi

# Roll path needs bake env for Swarm tags (file wins — bake ran in a subprocess).
if [ "${#SWARM_BUILD_SVCS[@]}" -gt 0 ]; then
  require_local_build_env || exit 1
elif [ -z "${APP_VERSION:-}" ]; then
  APP_VERSION="$(resolve_app_version)"
fi

# Swarm buildable: new bake tag; roll only when content ID changed (or --roll-only).
for s in "${SWARM_BUILD_SVCS[@]:-}"; do
  [ -n "${s}" ] || continue
  name="${STACK_NAME}_${s}"
  image="$(dev_image "${s}")"
  if ! docker service inspect "${name}" >/dev/null 2>&1; then
    echo "  skip ${name} (not deployed)"
    continue
  fi
  after="$(image_id "${image}")"
  before="${SWARM_IMAGE_BEFORE[$s]:-missing}"
  if [ "${ROLL_ONLY}" -eq 0 ] && [ "${before}" = "${after}" ] && [ "${after}" != "missing" ]; then
    echo "  skip ${name} (image unchanged; tag ${image})"
    continue
  fi
  echo "  roll ${name} -> ${image}"
  if [ "${DRY_RUN}" -eq 0 ]; then
    if [ -n "${APP_VERSION}" ]; then
      docker service update --detach --image "${image}" --env-add "APP_VERSION=${APP_VERSION}" "${name}" >/dev/null
    else
      docker service update --detach --image "${image}" "${name}" >/dev/null
    fi
  fi
done

# Pinned Swarm services (traefik / obs): force when listed — same stack, upstream image.
for s in "${SWARM_PINNED_SVCS[@]:-}"; do
  [ -n "${s}" ] || continue
  name="${STACK_NAME}_${s}"
  image="$(stack_pinned_image "${s}")"
  if ! docker service inspect "${name}" >/dev/null 2>&1; then
    echo "  skip ${name} (not deployed)"
    continue
  fi
  echo "  roll ${name} -> ${image} (--force; pinned Swarm)"
  if [ "${DRY_RUN}" -eq 0 ]; then
    docker service update --detach --force --image "${image}" "${name}" >/dev/null
  fi
done

if [ "${DRY_RUN}" -eq 1 ]; then
  echo "Dry-run complete (no build/roll executed)."
  exit 0
fi

echo "Done. Swarm: docker service ls --filter label=com.docker.stack.namespace=${STACK_NAME}"
