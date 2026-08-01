#!/usr/bin/env bash
# Eve Industry Planner - fresh install (Linux/macOS).
# Empty folder → host eip only. Stack YAML / .env come from eip init (or TUI Setup).
#
# Prefer pipe (never writes this script into the deploy home):
#   curl -fsSL …/eip-bootstrap.sh | bash -s -- ~/eip
#   curl -fsSL …/eip-bootstrap.sh | bash -s -- ~/eip --release prerelease-swarm-hard-cutover
#
# --release / EIP_RELEASE: exact GitHub Release tag for the host binary
#   (e.g. cli, cli-v1.0.0, prerelease-…). Omit for Public floating tag "cli".
#   Fails if that Release/asset is missing.
# --force re-downloads eip.
#
# Usage: eip-bootstrap.sh [DEPLOY_DIR] [--release TAG] [--force]
# Low-level override: EIP_CLI_DOWNLOAD_BASE

set -euo pipefail

REPO="${EIP_REPO:-darcy561/eve-industry-planner}"

DEPLOY=""
RELEASE="${EIP_RELEASE:-}"
FORCE=0

while [ $# -gt 0 ]; do
  case "$1" in
    --release|-r)
      RELEASE="${2:-}"
      shift 2
      ;;
    --force|-f)
      FORCE=1
      shift
      ;;
    --help|-h)
      sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'
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

RELEASE="$(echo "${RELEASE}" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"

if [ -n "${RELEASE}" ] && printf '%s' "${RELEASE}" | grep -qE '[[:space:]/\\]'; then
  echo "Error: invalid --release '${RELEASE}' (use the exact GitHub Release tag)." >&2
  exit 1
fi

# Explicit --release always wins (so a missing tag fails instead of a leftover EIP_CLI_DOWNLOAD_BASE).
if [ -n "${RELEASE}" ]; then
  DOWNLOAD_BASE="https://github.com/${REPO}/releases/download/${RELEASE}"
elif [ -n "${EIP_CLI_DOWNLOAD_BASE:-}" ]; then
  DOWNLOAD_BASE="${EIP_CLI_DOWNLOAD_BASE}"
else
  DOWNLOAD_BASE="https://github.com/${REPO}/releases/download/cli"
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd 2>/dev/null || true)"
if [ ! -f "${SCRIPT_DIR}/eip-bootstrap.sh" ]; then
  SCRIPT_DIR=""
fi

DEPLOY="${DEPLOY:-$(pwd)}"
mkdir -p "${DEPLOY}"
DEPLOY="$(cd "${DEPLOY}" && pwd)"
echo "EIP deploy home: ${DEPLOY}"
if [ -n "${RELEASE}" ]; then
  echo "  release: ${RELEASE}"
else
  echo "  release: cli (Public)"
fi
echo "  binary:  ${DOWNLOAD_BASE}"
if [ "${FORCE}" -eq 1 ]; then
  echo "  force:   re-download eip"
fi

host_asset_name() {
  local os arch
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  arch="$(uname -m)"
  case "${os}-${arch}" in
    linux-x86_64|linux-amd64) echo "eip-linux-amd64" ;;
    darwin-arm64) echo "eip-darwin-arm64" ;;
    darwin-x86_64|darwin-amd64) echo "eip-darwin-amd64" ;;
    *)
      echo "unsupported platform ${os}/${arch} - set EIP_CLI_DOWNLOAD_BASE to a full asset URL" >&2
      return 1
      ;;
  esac
}

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
  local asset url
  asset="$(host_asset_name)" || exit 1
  url="${DOWNLOAD_BASE%/}/${asset}"
  case "${DOWNLOAD_BASE}" in
    */eip|*/eip-linux-amd64|*/eip-darwin-amd64|*/eip-darwin-arm64) url="${DOWNLOAD_BASE}" ;;
  esac
  echo "  downloading ${asset}..."
  if ! curl -fsSL "${url}" -o "${staging}"; then
    rm -f "${staging}"
    if [ -n "${RELEASE}" ]; then
      echo "Error: no host binary for Release '${RELEASE}' (${url})." >&2
      echo "  Publish that tag or omit --release for Public cli." >&2
    else
      echo "Error: could not download Public host binary (${url})." >&2
    fi
    exit 1
  fi
  chmod +x "${staging}"
  if [ -e "${dest}" ]; then
    rm -f "${DEPLOY}/eip.old"
    if ! mv -f "${dest}" "${DEPLOY}/eip.old" 2>/dev/null; then
      echo "Error: existing eip is in use. Quit eip, then re-run with --force (binary saved as eip.new)." >&2
      exit 1
    fi
  fi
  mv -f "${staging}" "${dest}"
  echo "  wrote eip (download)"
  return 0
}

place_host_bin

if [ ! -x "${DEPLOY}/eip" ]; then
  echo "Error: no host eip in deploy home." >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "  note: Docker not on PATH - eip needs the Engine for doctor/stack commands"
fi

cat <<EOF

Done. This folder is your EIP home.
  cd "${DEPLOY}"
  ./eip init   # stack YAML + .env + eip.config.yaml
  ./eip        # or TUI Setup
  ./eip up
EOF
if [ -n "${RELEASE}" ]; then
  echo "  # release: ${RELEASE} (switch: re-run with --release <tag> --force, or omit for Public cli)"
else
  echo "  # release: cli (Public floating)"
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
