#!/bin/bash
# Escape hatch for app-train advertised version SoT.
# Prefer .env APP_VERSION + make release / make dev-release / make advertise.
#
# Usage:
#   scripts/ops/app-version-ops.sh get
#   scripts/ops/app-version-ops.sh set 0.9.0
#   scripts/ops/app-version-ops.sh clear   # delete key → API/WS fall back to process bake
#   make app-version-ops ARGS='set 0.9.0'

set -euo pipefail

_EIP_LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")/../lib" && pwd)"
# shellcheck source=../lib/redis.sh
source "${_EIP_LIB}/redis.sh"

# Fixed contracts — must match services/shared/appconfig AdvertisedVersion*Default.
VERSION_KEY="eip:app:advertised_version:v1"
VERSION_CHANNEL="eip:app:advertised_version:v1:notify"

fail() { echo "FAIL: $*" >&2; exit 1; }
info() { echo "$*"; }
trim() { eip_trim "$1"; }

usage() {
  sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'
  exit 2
}

[ $# -ge 1 ] || usage
CMD="$1"
shift

eip_redis_setup || fail "redis setup failed"

case "${CMD}" in
  get)
    val="$(redis_raw GET "${VERSION_KEY}")"
    if [ -z "${val}" ] || [ "${val}" = "(nil)" ]; then
      info "${VERSION_KEY}=(empty — process env fallback)"
    else
      info "${VERSION_KEY}=${val}"
    fi
    ;;
  set)
    [ $# -ge 1 ] || fail "usage: set <version>"
    ver="$(trim "$1")"
    [ -n "${ver}" ] || fail "version is empty"
    redis_cli SET "${VERSION_KEY}" "${ver}" >/dev/null
    redis_cli PUBLISH "${VERSION_CHANNEL}" "${ver}" >/dev/null
    info "SET ${VERSION_KEY}=${ver} + PUBLISH ${VERSION_CHANNEL}"
    ;;
  clear)
    redis_cli DEL "${VERSION_KEY}" >/dev/null
    info "DEL ${VERSION_KEY} (API/WS fall back to process env; no PUBLISH)"
    ;;
  *)
    usage
    ;;
esac
