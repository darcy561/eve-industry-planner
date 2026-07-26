# shellcheck shell=bash
# Resolve and run docker compose (local binary, plugin, or docker-compose).

# shellcheck source=paths.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/paths.sh"

if [ -n "${_EIP_LIB_COMPOSE:-}" ]; then
  return 0 2>/dev/null || true
fi
_EIP_LIB_COMPOSE=1

COMPOSE_BASE="${COMPOSE_BASE:-docker-compose.yml}"
COMPOSE_DEV="${COMPOSE_DEV:-docker-compose.dev.yml}"

# Set global EIP_COMPOSE_CMD as a bash array (call once per process).
eip_compose_resolve() {
  if [ -f "${EIP_ROOT}/bin/docker-compose" ] && [ -x "${EIP_ROOT}/bin/docker-compose" ]; then
    EIP_COMPOSE_CMD=("${EIP_ROOT}/bin/docker-compose")
  elif [ -f "${EIP_ROOT}/docker-compose" ] && [ -x "${EIP_ROOT}/docker-compose" ]; then
    EIP_COMPOSE_CMD=("${EIP_ROOT}/docker-compose")
  elif command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    EIP_COMPOSE_CMD=(docker compose)
  elif command -v docker-compose >/dev/null 2>&1; then
    EIP_COMPOSE_CMD=(docker-compose)
  else
    EIP_COMPOSE_CMD=(docker compose)
  fi
}

# Print a single-line description (for logs / make).
eip_compose_cmd() {
  eip_compose_resolve
  printf '%s\n' "${EIP_COMPOSE_CMD[*]}"
}

# Run: eip_compose_with_files <file...> -- <compose args...>
eip_compose_with_files() {
  local -a files=()
  local -a rest=()
  while [ "$#" -gt 0 ]; do
    if [ "$1" = "--" ]; then
      shift
      rest=("$@")
      break
    fi
    files+=(-f "$1")
    shift
  done
  eip_compose_resolve
  local -a args=()
  if [ -f "${EIP_ROOT}/${ENV_FILE}" ] || [ -f "${ENV_FILE}" ]; then
    args+=(--env-file "${ENV_FILE}")
  fi
  if [ "${#files[@]}" -eq 0 ]; then
    args+=(-f "${COMPOSE_BASE}")
  else
    args+=("${files[@]}")
  fi
  args+=("${rest[@]}")
  (
    cd "${EIP_ROOT}"
    "${EIP_COMPOSE_CMD[@]}" "${args[@]}"
  )
}

# Legacy name: Compose bring-up is gone. Swarm owns data/app/obs.
eip_compose_up() {
  echo "eip_compose_up: skipped (Swarm owns runtime; use make up / make dev)" >&2
  return 0
}

# Reload Alloy discovery after observability sync (Swarm force update).
eip_compose_restart_alloy() {
  local name="${STACK_NAME}_alloy"
  if docker service inspect "${name}" >/dev/null 2>&1; then
    echo "Forcing update of ${name} (reload discovery / config)…"
    docker service update --detach --force "${name}" >/dev/null
    return 0
  fi
  return 1
}
