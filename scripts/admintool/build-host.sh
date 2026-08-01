#!/usr/bin/env bash
# Build host eip binary from the admintool module into the repo root only.
#   ./scripts/admintool/build-host.sh
#   EIP_CLI_VERSION=0.1.0 ./scripts/admintool/build-host.sh
#
# If the install target is locked: ALERT, stop eip processes, wait, retry.
# Never write an alternate binary name. No dist/ output.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TAG="${EIP_CLI_VERSION:-0.0.0-dev}"
LD="-s -w -X eve-industry-planner/admintool/cmd/commands.Version=${TAG}"

stop_eip() {
  if command -v pkill >/dev/null 2>&1; then
    pkill -x eip 2>/dev/null || true
  fi
}

install_eip() {
  local src="$1" dest="$2"
  if cp -f "${src}" "${dest}" 2>/dev/null; then
    echo "wrote ${dest}"
    return 0
  fi

  echo "ALERT: ${dest} is locked (eip still running)." >&2
  echo "Stopping eip processes and waiting to install…" >&2
  stop_eip
  sleep 0.6

  local i
  for i in $(seq 1 40); do
    if cp -f "${src}" "${dest}" 2>/dev/null; then
      echo "wrote ${dest}"
      return 0
    fi
    sleep 0.4
  done

  echo "ALERT: still cannot update ${dest} after stopping eip / waiting." >&2
  echo "Quit eip manually, then re-run this script." >&2
  echo "Do not use an alternate output name." >&2
  exit 1
}

cd "${ROOT}/admintool"
export CGO_ENABLED=0

TMP="$(mktemp "${TMPDIR:-/tmp}/eip-build.XXXXXX")"
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*|Windows_NT)
    DEST="${ROOT}/eip.exe"
    ;;
  *)
    DEST="${ROOT}/eip"
    ;;
esac

cleanup() { rm -f "${TMP}"; }
trap cleanup EXIT

go build -ldflags "${LD}" -trimpath -o "${TMP}" .
install_eip "${TMP}" "${DEST}"
chmod +x "${DEST}" 2>/dev/null || true
