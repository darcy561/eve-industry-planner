#!/usr/bin/env bash
# Fail fast when .env APP_VERSION is missing/invalid.
set -euo pipefail

_EIP_LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")/../lib" && pwd)"
# shellcheck source=lib/root.sh
source "${_EIP_LIB}/root.sh"
# shellcheck source=lib/paths.sh
source "${_EIP_LIB}/paths.sh"
# shellcheck source=lib/env.sh
source "${_EIP_LIB}/env.sh"
eip_cd_root

v="$(resolve_app_version)"
v="$(printf '%s' "${v}" | tr -d '[:space:]')"
if [[ -z "${v}" ]]; then
  echo "ensure-app-version: APP_VERSION missing from ${ENV_FILE}" >&2
  exit 1
fi
if ! echo "${v}" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "ensure-app-version: APP_VERSION must match X.Y.Z (got: ${v})" >&2
  exit 1
fi

eip_vlog "ensure-app-version: APP_VERSION=${v} (from ${ENV_FILE})"
