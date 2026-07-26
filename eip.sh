#!/usr/bin/env bash
# Eve Industry Planner - launcher (thin wrapper).
# Product path: host ./eip (one binary: TUI / CLI). Source: admintool/
#   ./eip
#   ./eip doctor

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

is_eip_home() {
  local d="$1"
  [ -f "${d}/.eip-home" ] || [ -f "${d}/.env" ] || [ -f "${d}/docker-stack.yml" ] \
    || [ -f "${d}/docker-stack.data.yml" ] || [ -f "${d}/eip.config.yaml" ] || [ -f "${d}/eip.config.yml" ]
}

resolve_deploy() {
  if [ -n "${EIP_ROOT:-}" ]; then
    printf '%s\n' "${EIP_ROOT}"
    return
  fi
  if is_eip_home "${SCRIPT_DIR}"; then
    printf '%s\n' "${SCRIPT_DIR}"
    return
  fi
  pwd
}

host_bin="${SCRIPT_DIR}/eip"
if [ ! -x "${host_bin}" ]; then
  echo "Missing ./eip next to this launcher. Build with ./scripts/admintool/build-host.sh and re-run bootstrap." >&2
  exit 1
fi

cd "$(resolve_deploy)"
exec "${host_bin}" "$@"
