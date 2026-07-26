#!/usr/bin/env bash
# Eve Industry Planner - fresh install (Linux/macOS).
# Deploy home gets host eip (CLI + TUI in one binary) + starter config.
# Source module folder is admintool/; command prefix is eip.
#
#   ./scripts/admintool/build-host.sh
#   ./eip-bootstrap.sh /path/to/my-eip
#   cd /path/to/my-eip && ./eip

set -euo pipefail

PUBLIC_RAW="${EIP_PUBLIC_RAW:-https://raw.githubusercontent.com/darcy561/eve-industry-planner/refs/heads/Public}"
DOWNLOAD_BASE="${EIP_CLI_DOWNLOAD_BASE:-}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd 2>/dev/null || true)"
if [ ! -f "${SCRIPT_DIR}/eip.sh" ] && [ ! -f "${SCRIPT_DIR}/eip-bootstrap.sh" ]; then
  SCRIPT_DIR=""
fi

DEPLOY="${1:-$(pwd)}"
mkdir -p "${DEPLOY}"
DEPLOY="$(cd "${DEPLOY}" && pwd)"
echo "EIP deploy home: ${DEPLOY}"

fetch_or_copy() {
  local name="$1"
  local dest="${DEPLOY}/${name}"
  if [ -n "${SCRIPT_DIR}" ] && [ -f "${SCRIPT_DIR}/${name}" ]; then
    cp -f "${SCRIPT_DIR}/${name}" "${dest}"
    echo "  wrote ${name} (from local)"
  else
    echo "  downloading ${name}…"
    curl -fsSL "${PUBLIC_RAW}/${name}" -o "${dest}"
  fi
}

fetch_or_copy eip.sh
fetch_or_copy eip.cmd
fetch_or_copy eip.ps1
chmod +x "${DEPLOY}/eip.sh"

place_host_bin() {
  local dest="${DEPLOY}/eip"
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
  if [ -n "${DOWNLOAD_BASE}" ]; then
    local url="${DOWNLOAD_BASE}/eip-linux-amd64"
    case "${DOWNLOAD_BASE}" in
      */eip|*/eip-linux-amd64) url="${DOWNLOAD_BASE}" ;;
    esac
    echo "  downloading eip…"
    if curl -fsSL "${url}" -o "${dest}"; then
      chmod +x "${dest}"
      echo "  wrote eip (download)"
      return 0
    fi
    echo "  note: could not download host binary"
    rm -f "${dest}"
  else
    echo "  note: no host eip yet — build with ./scripts/admintool/build-host.sh or bake admintool-linux, then re-run bootstrap"
  fi
  return 1
}

place_host_bin || true

if [ ! -f "${DEPLOY}/.eip-home" ]; then
  printf 'Eve Industry Planner deploy home\n' >"${DEPLOY}/.eip-home"
  echo "  wrote .eip-home"
fi

if [ ! -x "${DEPLOY}/eip" ]; then
  echo "Error: no host eip in deploy home. Build with ./scripts/admintool/build-host.sh (or bake admintool-linux), then re-run bootstrap." >&2
  exit 1
fi

echo "  writing starter config from bundled templates (eip init)…"
( cd "${DEPLOY}" && ./eip init )

if ! command -v docker >/dev/null 2>&1; then
  echo "  note: Docker not on PATH — eip needs the Engine for doctor/stack commands"
fi

cat <<EOF

Done. This folder is your EIP home.
  cd "${DEPLOY}"
  edit .env   (and eip.config.yaml if you want)
  ./eip              # TUI (same binary)
  ./eip doctor       # CLI
EOF
