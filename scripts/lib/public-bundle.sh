# shellcheck shell=bash
# Sync docker-compose.yml, scripts/, observability/ from the Public branch tarball.

# shellcheck source=root.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/root.sh"
# shellcheck source=http.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/http.sh"

if [ -n "${_EIP_LIB_PUBLIC_BUNDLE:-}" ]; then
  return 0 2>/dev/null || true
fi
_EIP_LIB_PUBLIC_BUNDLE=1

EIP_PUBLIC_BRANCH="${EIP_PUBLIC_BRANCH:-Public}"
EIP_PUBLIC_REPO_TGZ_URL="${EIP_PUBLIC_REPO_TGZ_URL:-https://codeload.github.com/darcy561/eve-industry-planner/tar.gz/${EIP_PUBLIC_BRANCH}}"
EIP_DOWNLOADED_VERSIONS_FILE="${EIP_DOWNLOADED_VERSIONS_FILE:-.downloaded-versions.json}"

eip_public_latest_commit() {
  local api_url="https://api.github.com/repos/darcy561/eve-industry-planner/commits/${EIP_PUBLIC_BRANCH}"
  local body sha
  body="$(eip_http_get "${api_url}")"
  sha="$(printf '%s' "${body}" | grep -o '"sha":"[^"]*"' | head -1 | cut -d'"' -f4 || true)"
  if [ -n "${sha}" ]; then
    printf '%s\n' "${sha}"
  else
    printf '%s\n' "unknown"
  fi
}

eip_init_downloaded_versions() {
  if [ ! -f "${EIP_ROOT}/${EIP_DOWNLOADED_VERSIONS_FILE}" ]; then
    echo "{}" >"${EIP_ROOT}/${EIP_DOWNLOADED_VERSIONS_FILE}"
  fi
}

eip_record_sync_bundle() {
  local commit_sha="$1"
  local vf="${EIP_ROOT}/${EIP_DOWNLOADED_VERSIONS_FILE}"
  if ! command -v jq >/dev/null 2>&1; then
    return 0
  fi
  eip_init_downloaded_versions
  local timestamp
  timestamp="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  jq --arg sha "${commit_sha:-unknown}" \
    --arg time "${timestamp}" \
    --arg branch "${EIP_PUBLIC_BRANCH}" \
    '. + {sync_bundle: {commit: $sha, branch: $branch, downloaded_at: $time}}' \
    "${vf}" >"${vf}.tmp" && mv "${vf}.tmp" "${vf}"
}

# Replace compose + whole scripts/ + observability from Public archive.
eip_apply_public_archive() {
  local commit_sha="${1:-unknown}"
  local run_dir="${EIP_ROOT}"

  eip_require_download_tools || return 1
  if ! command -v tar >/dev/null 2>&1; then
    echo "Error: tar is required" >&2
    return 1
  fi

  local TMP tgz ROOT
  TMP="$(mktemp -d)"
  tgz="${TMP}/repo.tgz"
  echo "→ Downloading ${EIP_PUBLIC_BRANCH} branch archive from GitHub..."
  if ! eip_download_url "${EIP_PUBLIC_REPO_TGZ_URL}" "${tgz}"; then
    rm -rf "${TMP}"
    return 1
  fi

  tar -xzf "${tgz}" -C "${TMP}"
  ROOT="$(find "${TMP}" -mindepth 1 -maxdepth 1 -type d | head -1)"
  if [ -z "${ROOT}" ] || [ ! -f "${ROOT}/docker-compose.yml" ] || [ ! -d "${ROOT}/scripts" ]; then
    echo "Error: unexpected archive layout (expected docker-compose.yml and scripts/)" >&2
    rm -rf "${TMP}"
    return 1
  fi

  cp -f "${ROOT}/docker-compose.yml" "${run_dir}/"

  if [ -d "${ROOT}/observability" ]; then
    rm -rf "${run_dir}/observability"
    cp -a "${ROOT}/observability" "${run_dir}/"
  else
    rm -rf "${run_dir}/observability"
    echo "Note: observability/ not in Public archive; removed local observability/." >&2
  fi

  # Whole-folder replace (nested bootstrap/swarm/lib/ops/test).
  rm -rf "${run_dir}/scripts"
  cp -a "${ROOT}/scripts" "${run_dir}/scripts"
  find "${run_dir}/scripts" -type f -name '*.sh' -exec chmod +x {} +

  rm -rf "${TMP}"
  eip_record_sync_bundle "${commit_sha}"
  echo "Synced docker-compose.yml, scripts/, and observability/ (if present) from Public branch."
}

eip_required_bundle_files_missing() {
  local run_dir="${EIP_ROOT}"
  [ ! -f "${run_dir}/docker-compose.yml" ] && return 0
  [ ! -f "${run_dir}/scripts/bootstrap/mongo-setup.sh" ] && return 0
  [ ! -f "${run_dir}/scripts/bootstrap/ensure-refresh-token-key.sh" ] && return 0
  [ ! -f "${run_dir}/observability/alloy/config.alloy" ] && return 0
  return 1
}

eip_deployment_incomplete() {
  local run_dir="${EIP_ROOT}"
  [ ! -f "${run_dir}/docker-compose.yml" ] && return 0
  [ ! -f "${run_dir}/observability/prometheus/prometheus.yml" ] && return 0
  [ ! -f "${run_dir}/observability/alloy/config.alloy" ] && return 0
  [ ! -f "${run_dir}/scripts/bootstrap/mongo-setup.sh" ] && return 0
  [ ! -f "${run_dir}/scripts/bootstrap/ensure-refresh-token-key.sh" ] && return 0
  return 1
}
