# shellcheck shell=bash
# curl/wget helpers for Public-branch downloads.

if [ -n "${_EIP_LIB_HTTP:-}" ]; then
  return 0 2>/dev/null || true
fi
_EIP_LIB_HTTP=1

eip_require_download_tools() {
  if command -v curl >/dev/null 2>&1 || command -v wget >/dev/null 2>&1; then
    return 0
  fi
  echo "Error: curl or wget is required" >&2
  return 1
}

# Download URL to dest file (curl -L -f or wget -O).
eip_download_url() {
  local url="$1"
  local dest="$2"
  eip_require_download_tools || return 1
  if command -v curl >/dev/null 2>&1; then
    curl -L -f -o "${dest}" "${url}"
  else
    wget -O "${dest}" "${url}"
  fi
}

# GET URL body to stdout (quiet). Empty on failure.
eip_http_get() {
  local url="$1"
  if command -v curl >/dev/null 2>&1; then
    curl -s "${url}" 2>/dev/null || true
  elif command -v wget >/dev/null 2>&1; then
    wget -q -O - "${url}" 2>/dev/null || true
  else
    echo ""
  fi
}
