# shellcheck shell=bash
# Read keys from env files without sourcing (values may not be bash-safe).

# shellcheck source=paths.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/paths.sh"

read_env_key() {
  local file="$1" key="$2" line=""
  [ -f "${file}" ] || return 0
  # Missing key must not fail under `set -o pipefail` (grep exit 1).
  line="$(grep -E "^[[:space:]]*${key}=" "${file}" | head -1 || true)"
  [ -n "${line}" ] || return 0
  printf '%s' "${line}" | cut -d= -f2- | tr -d '\r' | sed 's/^["'\'']//;s/["'\'']$//'
}

# Resolve APP_VERSION from .env (SoT).
# Usage:
#   resolve_app_version                 # may be empty
#   resolve_app_version --required
#   resolve_app_version --default 0.0.0
resolve_app_version() {
  local mode=any default="" v=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --required) mode=required; shift ;;
      --default)
        mode=default
        default="${2:-}"
        shift 2
        ;;
      *)
        echo "resolve_app_version: unknown arg: $1" >&2
        return 2
        ;;
    esac
  done

  v="$(read_env_key "${ENV_FILE}" APP_VERSION)"
  v="$(printf '%s' "${v}" | tr -d '[:space:]')"

  case "${mode}" in
    required)
      if [ -z "${v}" ]; then
        echo "Error: APP_VERSION unset — set APP_VERSION=X.Y.Z in ${ENV_FILE}" >&2
        return 1
      fi
      ;;
    default)
      v="${v:-${default}}"
      ;;
  esac
  printf '%s' "${v}"
}
