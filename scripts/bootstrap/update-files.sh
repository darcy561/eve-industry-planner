#!/usr/bin/env bash
# make update-files: refresh Makefile + Public bundle (compose/scripts/observability).

set -euo pipefail

# Re-exec from a temp copy so replacing scripts/ cannot truncate this process.
if [ -z "${EIP_UPDATE_REEXEC:-}" ]; then
  export EIP_UPDATE_ROOT="$(pwd)"
  _self="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
  _tmp="$(mktemp)"
  cp "${_self}" "${_tmp}"
  chmod +x "${_tmp}"
  export EIP_UPDATE_REEXEC=1
  exec "${_tmp}" "$@"
fi

cd "${EIP_UPDATE_ROOT:-.}"
_EIP_LIB="$(pwd)/scripts/lib"
if [ ! -f "${_EIP_LIB}/root.sh" ]; then
  echo "Error: cannot locate scripts/lib (run from repo root)" >&2
  exit 1
fi

# shellcheck source=../lib/root.sh
source "${_EIP_LIB}/root.sh"
# shellcheck source=../lib/http.sh
source "${_EIP_LIB}/http.sh"
# shellcheck source=../lib/public-bundle.sh
source "${_EIP_LIB}/public-bundle.sh"
# shellcheck source=../lib/compose.sh
source "${_EIP_LIB}/compose.sh"
eip_cd_root

MAKEFILE_URL="https://raw.githubusercontent.com/darcy561/eve-industry-planner/refs/heads/Public/Makefile"

echo "Updating files from GitHub..." >&2
echo "" >&2
echo "Updating Makefile..." >&2
TEMP_FILE="$(mktemp "${EIP_ROOT}/Makefile.tmp.XXXXXX")"
if ! eip_download_url "${MAKEFILE_URL}" "${TEMP_FILE}"; then
  echo "Error: Failed to download Makefile from GitHub" >&2
  rm -f "${TEMP_FILE}"
  exit 1
fi
mv "${TEMP_FILE}" "${EIP_ROOT}/Makefile"
echo "Makefile updated successfully!" >&2
echo "" >&2

# Apply archive from this re-exec'd process (do not spawn scripts/bootstrap/* —
# those paths are replaced mid-run by eip_apply_public_archive).
echo "Updating tracked repo files (compose, scripts, observability)..." >&2
VERSION_FILE="${EIP_DOWNLOADED_VERSIONS_FILE}"
eip_init_downloaded_versions
latest_commit="$(eip_public_latest_commit)"
stored=""
if [ -f "${VERSION_FILE}" ] && command -v jq >/dev/null 2>&1; then
  stored="$(jq -r '.sync_bundle.commit // empty' "${VERSION_FILE}" 2>/dev/null || true)"
fi
if [ -n "${stored}" ] && [ -n "${latest_commit}" ] && [ "${latest_commit}" != "unknown" ] && [ "${stored}" = "${latest_commit}" ]; then
  if eip_required_bundle_files_missing; then
    echo "Tracked bundle file(s) missing locally; forcing re-sync..."
    eip_apply_public_archive "${latest_commit}"
  else
    echo "All files are up to date (Public @ ${latest_commit:0:8})"
  fi
else
  if [ "${latest_commit}" = "unknown" ]; then
    echo "Warning: Could not determine latest commit from GitHub API; syncing archive anyway." >&2
  else
    echo "Syncing from Public (commit ${latest_commit:0:8})..."
  fi
  eip_apply_public_archive "${latest_commit}"
fi

echo "Restarting Alloy when the stack is up (refreshes log tailers after observability sync)..."
eip_compose_restart_alloy live \
  || echo "Note: Alloy not restarted (stack may not be running yet)." >&2
