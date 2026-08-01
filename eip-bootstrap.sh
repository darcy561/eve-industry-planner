#!/usr/bin/env bash
# Eve Industry Planner - fresh install (Linux/macOS).
# Empty folder → host eip (CLI+TUI) + stack YAML.
# eip lives in this folder; that directory is project home (desktop shortcuts OK).
# Operator docs (.env / eip.config.yaml): run ./eip (TUI Setup) or ./eip init.
#
# Prefer pipe (never writes this script into the deploy home):
#   curl -fsSL …/Development/eip-bootstrap.sh | bash -s -- ~/eip
# If the script file lives inside the home, it deletes itself after success.
#
# Per-branch:
#   EIP_KIT_BRANCH=swarm/my-feature \
#   EIP_CLI_DOWNLOAD_BASE=https://github.com/darcy561/eve-industry-planner/releases/download/prerelease-swarm-my-feature \
#   bash eip-bootstrap.sh ~/eip
#
# Overrides:
#   EIP_KIT_BRANCH          raw GitHub branch for stack YAML (default: Development)
#   EIP_CLI_DOWNLOAD_BASE   Release asset directory (default: …/releases/download/prerelease)
#   EIP_PUBLIC_RAW          full raw base URL (overrides EIP_KIT_BRANCH)

set -euo pipefail

REPO="${EIP_REPO:-darcy561/eve-industry-planner}"
KIT_BRANCH="${EIP_KIT_BRANCH:-Development}"
PUBLIC_RAW="${EIP_PUBLIC_RAW:-https://raw.githubusercontent.com/${REPO}/refs/heads/${KIT_BRANCH}}"
DOWNLOAD_BASE="${EIP_CLI_DOWNLOAD_BASE:-https://github.com/${REPO}/releases/download/prerelease}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd 2>/dev/null || true)"
if [ ! -f "${SCRIPT_DIR}/eip-bootstrap.sh" ]; then
  SCRIPT_DIR=""
fi

DEPLOY="${1:-$(pwd)}"
mkdir -p "${DEPLOY}"
DEPLOY="$(cd "${DEPLOY}" && pwd)"
echo "EIP deploy home: ${DEPLOY}"
echo "  kit source: ${PUBLIC_RAW}"
echo "  binary:     ${DOWNLOAD_BASE}"

fetch_stack_missing() {
  local name="$1"
  local dest="${DEPLOY}/${name}"
  if [ -f "${dest}" ]; then
    echo "  ${name} already present (unchanged)"
    return 0
  fi
  if [ -n "${SCRIPT_DIR}" ] && [ -f "${SCRIPT_DIR}/${name}" ]; then
    cp -f "${SCRIPT_DIR}/${name}" "${dest}"
    echo "  wrote ${name} (from local)"
    return 0
  fi
  echo "  downloading ${name}…"
  curl -fsSL "${PUBLIC_RAW}/${name}" -o "${dest}"
  echo "  wrote ${name}"
}

host_asset_name() {
  local os arch
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  arch="$(uname -m)"
  case "${os}-${arch}" in
    linux-x86_64|linux-amd64) echo "eip-linux-amd64" ;;
    darwin-arm64) echo "eip-darwin-arm64" ;;
    darwin-x86_64|darwin-amd64) echo "eip-darwin-amd64" ;;
    *)
      echo "unsupported platform ${os}/${arch} — set EIP_CLI_DOWNLOAD_BASE to a full asset URL" >&2
      return 1
      ;;
  esac
}

for f in docker-stack.yml docker-stack.data.yml docker-stack.obs.yml; do
  fetch_stack_missing "${f}"
done

place_host_bin() {
  local dest="${DEPLOY}/eip"
  if [ -x "${dest}" ]; then
    echo "  eip already present (unchanged)"
    return 0
  fi
  if [ -n "${SCRIPT_DIR}" ]; then
    if [ -f "${SCRIPT_DIR}/eip" ]; then
      cp -f "${SCRIPT_DIR}/eip" "${dest}"
      chmod +x "${dest}"
      echo "  wrote eip (from local eip)"
      return 0
    fi
    if [ -f "${SCRIPT_DIR}/eip.exe" ]; then
      cp -f "${SCRIPT_DIR}/eip.exe" "${dest}"
      chmod +x "${dest}"
      echo "  wrote eip (from local eip.exe)"
      return 0
    fi
  fi
  if [ -z "${DOWNLOAD_BASE}" ]; then
    echo "  note: no host eip yet — build with ./scripts/admintool/build-host.sh, then re-run bootstrap"
    return 1
  fi
  local asset url
  asset="$(host_asset_name)" || return 1
  url="${DOWNLOAD_BASE%/}/${asset}"
  case "${DOWNLOAD_BASE}" in
    */eip|*/eip-linux-amd64|*/eip-darwin-amd64|*/eip-darwin-arm64) url="${DOWNLOAD_BASE}" ;;
  esac
  echo "  downloading ${asset}…"
  if curl -fsSL "${url}" -o "${dest}"; then
    chmod +x "${dest}"
    echo "  wrote eip (download)"
    return 0
  fi
  echo "  note: could not download host binary from ${url}"
  rm -f "${dest}"
  return 1
}

place_host_bin || true

if [ ! -x "${DEPLOY}/eip" ]; then
  echo "Error: no host eip in deploy home. Publish a prerelease (publish-prerelease.yml)," >&2
  echo "  or build with ./scripts/admintool/build-host.sh, then re-run bootstrap." >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "  note: Docker not on PATH — eip needs the Engine for doctor/stack commands"
fi

cat <<EOF

Done. This folder is your EIP home.
  cd "${DEPLOY}"
  ./eip          # TUI Setup writes .env / eip.config.yaml
  # or: ./eip init
  # optional: ./eip add-path   # bare eip on PATH
  export EIP_UPDATE_TAG=prerelease   # for eip update-binary on this channel
  ./eip up
EOF

# Drop this installer if it lives inside the deploy home (not when run from the repo).
SCRIPT_FILE=""
if [ -n "${BASH_SOURCE[0]:-}" ] && [ -f "${BASH_SOURCE[0]}" ]; then
  SCRIPT_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
fi
if [ -n "${SCRIPT_FILE}" ] && [ -f "${SCRIPT_FILE}" ]; then
  case "${SCRIPT_FILE}" in
    "${DEPLOY}"|"${DEPLOY}"/*)
      rm -f "${SCRIPT_FILE}" && echo "  removed bootstrap script from deploy home" || true
      ;;
  esac
fi
