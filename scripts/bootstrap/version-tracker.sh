#!/usr/bin/env bash
# Compare local sync state to the latest commit on GitHub Public; if it changed,
# re-download the branch tarball and replace docker-compose.yml, scripts/, and observability/

set -euo pipefail

_EIP_LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")/../lib" && pwd)"
# shellcheck source=../lib/root.sh
source "${_EIP_LIB}/root.sh"
# shellcheck source=../lib/public-bundle.sh
source "${_EIP_LIB}/public-bundle.sh"
eip_cd_root

VERSION_FILE="${EIP_DOWNLOADED_VERSIONS_FILE}"

get_stored_sync_commit() {
  if [ -f "${VERSION_FILE}" ] && command -v jq >/dev/null 2>&1; then
    jq -r '.sync_bundle.commit // empty' "${VERSION_FILE}" 2>/dev/null || true
  else
    echo ""
  fi
}

update_files() {
  eip_init_downloaded_versions

  local latest_commit stored
  latest_commit="$(eip_public_latest_commit)"
  stored="$(get_stored_sync_commit)"

  if [ -n "${stored}" ] && [ -n "${latest_commit}" ] && [ "${latest_commit}" != "unknown" ] && [ "${stored}" = "${latest_commit}" ]; then
    if eip_required_bundle_files_missing; then
      echo "Tracked bundle file(s) missing locally; forcing re-sync..."
      eip_apply_public_archive "${latest_commit}"
      return 0
    fi
    echo "All files are up to date (Public @ ${latest_commit:0:8})"
    return 0
  fi

  if [ "${latest_commit}" = "unknown" ]; then
    echo "Warning: Could not determine latest commit from GitHub API; syncing archive anyway." >&2
  else
    echo "Syncing from Public (commit ${latest_commit:0:8})..."
  fi

  eip_apply_public_archive "${latest_commit}"
}

case "${1:-update}" in
  update)
    update_files
    ;;
  *)
    echo "Usage: $0 [update]"
    echo ""
    echo "Re-syncs compose, scripts/, and observability/ when Public branch HEAD changes."
    exit 1
    ;;
esac
