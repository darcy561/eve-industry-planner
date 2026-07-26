# shellcheck shell=bash
# Operator console helpers. Quiet by default; EIP_VERBOSE=1 (or VERBOSE=1) for detail.

if [ -n "${_EIP_LIB_LOG:-}" ]; then
  return 0 2>/dev/null || true
fi
_EIP_LIB_LOG=1

eip_verbose() {
  case "${EIP_VERBOSE:-${VERBOSE:-0}}" in
    1|true|yes|YES|True) return 0 ;;
    *) return 1 ;;
  esac
}

# Always print (progress / errors callers already send to stderr).
eip_log() {
  printf '%s\n' "$*"
}

# Detail only when verbose.
eip_vlog() {
  eip_verbose || return 0
  printf '%s\n' "$*"
}

# docker stack deploy. Quiet success (no Swarm CLI chatter); full output on failure.
# Still prints "Removing service …" when --prune drops something.
# EIP_VERBOSE=1 → raw docker output always.
eip_docker_stack_deploy() {
  local out rc=0
  if eip_verbose; then
    docker stack deploy "$@"
    return $?
  fi
  set +e
  out="$(docker stack deploy "$@" 2>&1)"
  rc=$?
  set -e
  if [ "${rc}" -ne 0 ]; then
    printf '%s\n' "${out}" >&2
  elif [ -n "${out}" ]; then
    printf '%s\n' "${out}" | grep -E '^Removing service ' || true
  fi
  return "${rc}"
}
