#!/usr/bin/env bash
# Eve Industry Planner - fresh install (Linux/macOS).
# Empty folder → host eip (CLI+TUI) + stack YAML.
#
# Prefer pipe (never writes this script into the deploy home):
#   curl -fsSL …/eip-bootstrap.sh | bash -s -- ~/eip --channel swarm/hard-cutover
#
# Channels (--channel / EIP_CHANNEL):
#   Development | prerelease     → kit: Development, binary: prerelease
#   swarm/my-feature             → kit: that branch, binary: prerelease-<slug>
#   prerelease-swarm-my-feature  → same (tag form)
#   Public | latest              → kit: Public, binary: /releases/latest
# --force re-downloads stacks + eip (use when switching channels).
#
# Usage: eip-bootstrap.sh [DEPLOY_DIR] [--channel NAME] [--force]
# Low-level overrides: EIP_KIT_BRANCH, EIP_CLI_DOWNLOAD_BASE, EIP_PUBLIC_RAW

set -euo pipefail

REPO="${EIP_REPO:-darcy561/eve-industry-planner}"

DEPLOY=""
CHANNEL="${EIP_CHANNEL:-}"
FORCE=0

while [ $# -gt 0 ]; do
  case "$1" in
    --channel|-c)
      CHANNEL="${2:-}"
      shift 2
      ;;
    --force|-f)
      FORCE=1
      shift
      ;;
    --help|-h)
      sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    -*)
      echo "Unknown flag: $1" >&2
      exit 1
      ;;
    *)
      if [ -z "${DEPLOY}" ]; then
        DEPLOY="$1"
      else
        echo "Unexpected argument: $1" >&2
        exit 1
      fi
      shift
      ;;
  esac
done

branch_slug() {
  echo "$1" | tr '[:upper:]' '[:lower:]' | sed 's#/#-#g' | sed 's/[^a-z0-9._-]/-/g' | sed 's/--*/-/g' | sed 's/^-//;s/-$//'
}

resolve_channel() {
  local ch="${1:-Development}"
  ch="$(echo "${ch}" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
  KIT_BRANCH=""
  CHANNEL_TAG=""
  DOWNLOAD_BASE=""
  case "$(echo "${ch}" | tr '[:upper:]' '[:lower:]')" in
    public|latest)
      KIT_BRANCH="Public"
      CHANNEL_TAG=""
      DOWNLOAD_BASE="https://github.com/${REPO}/releases/latest/download"
      ;;
    development|prerelease)
      KIT_BRANCH="Development"
      CHANNEL_TAG="prerelease"
      DOWNLOAD_BASE="https://github.com/${REPO}/releases/download/prerelease"
      ;;
    prerelease-*)
      local slug="${ch#prerelease-}"
      slug="$(echo "${slug}" | tr '[:upper:]' '[:lower:]')"
      case "${slug}" in
        swarm-*)
          KIT_BRANCH="swarm/${slug#swarm-}"
          ;;
        development)
          KIT_BRANCH="Development"
          ;;
        *)
          KIT_BRANCH="${slug}"
          ;;
      esac
      CHANNEL_TAG="prerelease-${slug}"
      DOWNLOAD_BASE="https://github.com/${REPO}/releases/download/${CHANNEL_TAG}"
      ;;
    *)
      KIT_BRANCH="${ch#refs/heads/}"
      local slug
      slug="$(branch_slug "${KIT_BRANCH}")"
      if [ "$(echo "${KIT_BRANCH}" | tr '[:upper:]' '[:lower:]')" = "development" ]; then
        CHANNEL_TAG="prerelease"
        DOWNLOAD_BASE="https://github.com/${REPO}/releases/download/prerelease"
      else
        CHANNEL_TAG="prerelease-${slug}"
        DOWNLOAD_BASE="https://github.com/${REPO}/releases/download/${CHANNEL_TAG}"
      fi
      ;;
  esac
  CHANNEL_INPUT="${ch}"
}

resolve_channel "${CHANNEL:-Development}"

KIT_BRANCH="${EIP_KIT_BRANCH:-${KIT_BRANCH}}"
PUBLIC_RAW="${EIP_PUBLIC_RAW:-https://raw.githubusercontent.com/${REPO}/refs/heads/${KIT_BRANCH}}"
DOWNLOAD_BASE="${EIP_CLI_DOWNLOAD_BASE:-${DOWNLOAD_BASE}}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd 2>/dev/null || true)"
if [ ! -f "${SCRIPT_DIR}/eip-bootstrap.sh" ]; then
  SCRIPT_DIR=""
fi

DEPLOY="${DEPLOY:-$(pwd)}"
mkdir -p "${DEPLOY}"
DEPLOY="$(cd "${DEPLOY}" && pwd)"
echo "EIP deploy home: ${DEPLOY}"
echo "  channel:    ${CHANNEL_INPUT}"
if [ -n "${CHANNEL_TAG}" ]; then
  echo "  eip tag:    ${CHANNEL_TAG}"
else
  echo "  eip tag:    latest (Public)"
fi
echo "  kit source: ${PUBLIC_RAW}"
echo "  binary:     ${DOWNLOAD_BASE}"
if [ "${FORCE}" -eq 1 ]; then
  echo "  force:      re-download stacks + eip"
fi

fetch_stack() {
  local name="$1"
  local dest="${DEPLOY}/${name}"
  if [ -f "${dest}" ] && [ "${FORCE}" -eq 0 ]; then
    echo "  ${name} already present (unchanged)"
    return 0
  fi
  if [ "${FORCE}" -eq 0 ] && [ -n "${SCRIPT_DIR}" ] && [ -f "${SCRIPT_DIR}/${name}" ]; then
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
  fetch_stack "${f}"
done

place_host_bin() {
  local dest="${DEPLOY}/eip"
  local staging="${DEPLOY}/eip.new"
  if [ -x "${dest}" ] && [ "${FORCE}" -eq 0 ]; then
    echo "  eip already present (unchanged)"
    return 0
  fi
  if [ "${FORCE}" -eq 0 ] && [ -n "${SCRIPT_DIR}" ]; then
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
  echo "  downloading ${asset}..."
  if ! curl -fsSL "${url}" -o "${staging}"; then
    echo "  note: could not download host binary from ${url}"
    rm -f "${staging}"
    return 1
  fi
  chmod +x "${staging}"
  if [ -e "${dest}" ]; then
    rm -f "${DEPLOY}/eip.old"
    if ! mv -f "${dest}" "${DEPLOY}/eip.old" 2>/dev/null; then
      echo "  note: existing eip is in use — downloaded to eip.new; quit eip and re-run with --force, or replace manually"
      echo "  wrote eip.new (download)"
      return 1
    fi
  fi
  mv -f "${staging}" "${dest}"
  echo "  wrote eip (download)"
  return 0
}

place_host_bin || true

if [ ! -x "${DEPLOY}/eip" ]; then
  echo "Error: no host eip in deploy home. Publish the channel (publish-prerelease.yml)," >&2
  echo "  or build with ./scripts/admintool/build-host.sh, then re-run bootstrap." >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "  note: Docker not on PATH — eip needs the Engine for doctor/stack commands"
fi

cat <<EOF

Done. This folder is your EIP home.
  cd "${DEPLOY}"
  ./eip          # TUI Setup (APP_VERSION preset from baked channel on prerelease builds)
  ./eip up
EOF
if [ -n "${CHANNEL_TAG}" ]; then
  echo "  # channel tag: ${CHANNEL_TAG} (switch later: re-run with --channel <name> --force)"
fi

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
