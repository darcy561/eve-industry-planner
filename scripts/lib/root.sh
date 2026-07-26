# shellcheck shell=bash
# Repo / scripts path anchors. Source this (or any other lib/* that pulls it in).
# Locates ROOT from this file's path so ops/test/bootstrap depth does not matter.

# Re-source guard: never `exit` here — that can kill a parent script if `return` fails (e.g. CRLF).
if [ -n "${_EIP_LIB_ROOT:-}" ]; then
  return 0 2>/dev/null || true
fi

_EIP_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EIP_SCRIPTS_DIR="$(cd "${_EIP_LIB_DIR}/.." && pwd)"
EIP_SWARM_DIR="${EIP_SCRIPTS_DIR}/swarm"
EIP_ROOT="$(cd "${EIP_SCRIPTS_DIR}/.." && pwd)"
# Compat with existing scripts that expect ROOT=
ROOT="${ROOT:-${EIP_ROOT}}"
_EIP_LIB_ROOT=1

# shellcheck source=log.sh
source "${_EIP_LIB_DIR}/log.sh"

eip_cd_root() {
  cd "${EIP_ROOT}"
}
