#!/bin/bash
# make advertise: flip Redis advertised version (.env APP_VERSION → SoT + PUBLISH).
# Run AFTER NEW images are built and running. Not part of make swarm-sync.
#
# Usage:
#   scripts/ops/advertise.sh
#   scripts/ops/advertise.sh --dry-run
#   make advertise
#   make advertise ARGS='--dry-run'

set -euo pipefail

_EIP_LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")/../lib" && pwd)"
# shellcheck source=../lib/root.sh
source "${_EIP_LIB}/root.sh"
# shellcheck source=../lib/env.sh
source "${_EIP_LIB}/env.sh"
# shellcheck source=../lib/eip-config.sh
source "${_EIP_LIB}/eip-config.sh"
eip_cd_root

DRY_RUN=0
for arg in "$@"; do
  case "${arg}" in
    --dry-run|-n) DRY_RUN=1 ;;
    -h|--help)
      echo "Usage: $0 [--dry-run]"
      exit 0
      ;;
  esac
done

APP_VERSION="$(resolve_app_version --required)" || exit 1
ARGS=(advertise --version "${APP_VERSION}")
if [ "${DRY_RUN}" -eq 1 ]; then
  ARGS+=(--dry-run)
fi

echo "App-train advertise APP_VERSION=${APP_VERSION} (from ${ENV_FILE})…"
eipconfig_run_raw "${ARGS[@]}"
