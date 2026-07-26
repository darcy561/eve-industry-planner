# shellcheck shell=bash
# Expand stack compose files with .env (+ ephemeral sync-env from eip.config) for
# interpolation (${APP_VERSION}, ${EIP_*}, public knobs). Credentials are Swarm
# secrets (.eip-swarm-secrets.yml), not env_file.

# shellcheck source=paths.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/paths.sh"
# shellcheck source=eip-config.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/eip-config.sh"

# Optional extra --env-file paths (e.g. .eip-local-build.env for --dev).
# Callers: STACK_EXPAND_EXTRA_ENV_FILES=(file...) expand_stack_files ...
#
# Ephemeral sync-env: STACK_EXPAND_SYNC_ENV is set by expand_stack_files and removed
# after each expand. stack_compose_env_args alone creates a temp if unset (caller
# should rm STACK_EXPAND_SYNC_ENV).
stack_compose_env_args() {
  COMPOSE_ENV_ARGS=(--env-file "${ENV_FILE}")
  if [ -z "${STACK_EXPAND_SYNC_ENV:-}" ]; then
    STACK_EXPAND_SYNC_ENV="$(eip_sync_env_temp)" || return 1
  fi
  COMPOSE_ENV_ARGS+=(--env-file "${STACK_EXPAND_SYNC_ENV}")
  export EIP_SYNC_ENV_FILE="${STACK_EXPAND_SYNC_ENV}"
  local f
  for f in "${STACK_EXPAND_EXTRA_ENV_FILES[@]:-}"; do
    [ -n "${f}" ] || continue
    if [ -f "${f}" ]; then
      COMPOSE_ENV_ARGS+=(--env-file "${f}")
    fi
  done
}

# Expand one or more stack compose files to a temp path (caller owns OUT + trap).
# Usage: expand_stack_files OUT_FILE stack.yml [overlay.yml ...]
expand_stack_files() {
  local out="$1"
  shift
  local args=() f sync_owned=0
  if [ "$#" -lt 1 ]; then
    echo "expand_stack_files: need at least one stack file" >&2
    return 1
  fi
  for f in "$@"; do
    args+=(-f "${f}")
  done
  if [ -z "${STACK_EXPAND_SYNC_ENV:-}" ]; then
    STACK_EXPAND_SYNC_ENV="$(eip_sync_env_temp)" || return 1
    sync_owned=1
  fi
  stack_compose_env_args || {
    [ "${sync_owned}" -eq 1 ] && rm -f "${STACK_EXPAND_SYNC_ENV}"
    unset STACK_EXPAND_SYNC_ENV
    return 1
  }
  docker compose "${COMPOSE_ENV_ARGS[@]}" "${args[@]}" config \
    | awk 'NR==1 && $0 ~ /^name:/ { next } { print }' \
    | sed -E 's/^([[:space:]]*published: )"([0-9]+)"$/\1\2/' \
    >"${out}"
  local rc=$?
  if [ "${sync_owned}" -eq 1 ]; then
    rm -f "${STACK_EXPAND_SYNC_ENV}"
    unset STACK_EXPAND_SYNC_ENV
  fi
  return "${rc}"
}
