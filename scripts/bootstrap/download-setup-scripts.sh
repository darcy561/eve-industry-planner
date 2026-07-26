#!/usr/bin/env bash
# If the deploy layout is incomplete, download the Public branch as a tarball and extract:
#   docker-compose.yml, observability/, scripts/
# Use 'make update-files' to refresh when upstream changes (commit-based).
#
# Chicken-egg: this script must run when scripts/lib is missing (Makefile curls it first).
# When lib is present (git clone / post-sync), prefer shared public-bundle helpers.

set -euo pipefail

_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_LIB_CANDIDATE="${_SCRIPT_DIR}/../lib/public-bundle.sh"

if [ -f "${_LIB_CANDIDATE}" ]; then
  _EIP_LIB="$(cd "${_SCRIPT_DIR}/../lib" && pwd)"
  # shellcheck source=../lib/root.sh
  source "${_EIP_LIB}/root.sh"
  # shellcheck source=../lib/public-bundle.sh
  source "${_EIP_LIB}/public-bundle.sh"
  eip_cd_root

  LATEST_COMMIT="$(eip_public_latest_commit)"
  if [ -n "${LATEST_COMMIT}" ] && [ "${LATEST_COMMIT}" != "unknown" ]; then
    echo "Checking deploy files (Public @ ${LATEST_COMMIT:0:8})..."
  else
    echo "Checking deploy files..."
  fi

  if eip_deployment_incomplete; then
    echo "Some deploy files are missing. Fetching full Public archive..."
    echo ""
    eip_apply_public_archive "${LATEST_COMMIT}"
  else
    echo "All required files already exist (use 'make update-files' to refresh from GitHub)"
  fi
  exit 0
fi

# --- First-boot fallback (no lib yet): minimal whole-folder archive apply ---
RUN_DIR="$(pwd)"
mkdir -p "${RUN_DIR}/scripts/bootstrap"

if ! command -v curl >/dev/null 2>&1 && ! command -v wget >/dev/null 2>&1; then
  echo "Error: curl or wget is required" >&2
  exit 1
fi
if ! command -v tar >/dev/null 2>&1; then
  echo "Error: tar is required to extract the GitHub archive" >&2
  exit 1
fi

BRANCH="Public"
REPO_TGZ_URL="https://codeload.github.com/darcy561/eve-industry-planner/tar.gz/${BRANCH}"

get_latest_commit() {
  local api_url="https://api.github.com/repos/darcy561/eve-industry-planner/commits/${BRANCH}"
  if command -v curl >/dev/null 2>&1; then
    curl -s "${api_url}" 2>/dev/null | grep -o '"sha":"[^"]*"' | head -1 | cut -d'"' -f4 || echo "unknown"
  else
    wget -q -O - "${api_url}" 2>/dev/null | grep -o '"sha":"[^"]*"' | head -1 | cut -d'"' -f4 || echo "unknown"
  fi
}

apply_public_archive_inline() {
  local commit_sha="$1"
  local TMP tgz ROOT
  TMP="$(mktemp -d)"
  tgz="${TMP}/repo.tgz"
  echo "→ Downloading ${BRANCH} branch archive from GitHub..."
  if command -v curl >/dev/null 2>&1; then
    curl -L -f -o "${tgz}" "${REPO_TGZ_URL}" || {
      rm -rf "${TMP}"
      return 1
    }
  else
    wget -q -O "${tgz}" "${REPO_TGZ_URL}" || {
      rm -rf "${TMP}"
      return 1
    }
  fi
  tar -xzf "${tgz}" -C "${TMP}"
  ROOT="$(find "${TMP}" -mindepth 1 -maxdepth 1 -type d | head -1)"
  if [ -z "${ROOT}" ] || [ ! -f "${ROOT}/docker-compose.yml" ] || [ ! -d "${ROOT}/scripts" ]; then
    echo "Error: unexpected archive layout (expected docker-compose.yml and scripts/)" >&2
    rm -rf "${TMP}"
    return 1
  fi
  cp -f "${ROOT}/docker-compose.yml" "${RUN_DIR}/"
  if [ -d "${ROOT}/observability" ]; then
    rm -rf "${RUN_DIR}/observability"
    cp -a "${ROOT}/observability" "${RUN_DIR}/"
  else
    rm -rf "${RUN_DIR}/observability"
    echo "Note: observability/ not in Public archive; removed local observability/." >&2
  fi
  rm -rf "${RUN_DIR}/scripts"
  cp -a "${ROOT}/scripts" "${RUN_DIR}/scripts"
  find "${RUN_DIR}/scripts" -type f -name '*.sh' -exec chmod +x {} +
  rm -rf "${TMP}"
  local vf="${RUN_DIR}/.downloaded-versions.json"
  if command -v jq >/dev/null 2>&1; then
    [ ! -f "${vf}" ] && echo "{}" >"${vf}"
    local timestamp
    timestamp="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    jq --arg sha "${commit_sha:-unknown}" \
      --arg time "${timestamp}" \
      --arg branch "${BRANCH}" \
      '. + {sync_bundle: {commit: $sha, branch: $branch, downloaded_at: $time}}' \
      "${vf}" >"${vf}.tmp" && mv "${vf}.tmp" "${vf}"
  fi
  echo "Synced docker-compose.yml, scripts/, and observability/ (if present) from Public branch."
}

deployment_incomplete() {
  [ ! -f "${RUN_DIR}/docker-compose.yml" ] && return 0
  [ ! -f "${RUN_DIR}/observability/prometheus/prometheus.yml" ] && return 0
  [ ! -f "${RUN_DIR}/observability/alloy/config.alloy" ] && return 0
  [ ! -f "${RUN_DIR}/scripts/bootstrap/mongo-setup.sh" ] && return 0
  [ ! -f "${RUN_DIR}/scripts/bootstrap/ensure-refresh-token-key.sh" ] && return 0
  return 1
}

LATEST_COMMIT="$(get_latest_commit)"
if [ -n "${LATEST_COMMIT}" ] && [ "${LATEST_COMMIT}" != "unknown" ]; then
  echo "Checking deploy files (Public @ ${LATEST_COMMIT:0:8})..."
else
  echo "Checking deploy files..."
fi

if deployment_incomplete; then
  echo "Some deploy files are missing. Fetching full Public archive..."
  echo ""
  apply_public_archive_inline "${LATEST_COMMIT}"
else
  echo "All required files already exist (use 'make update-files' to refresh from GitHub)"
fi
