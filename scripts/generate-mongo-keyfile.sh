#!/bin/bash
set -u

KEYFILE_PATH="./mongo-keyfile"

fail() {
  echo "ERROR: $1" >&2
  exit 1
}

if [ -f "${KEYFILE_PATH}" ] && [ -s "${KEYFILE_PATH}" ]; then
  echo "Mongo keyfile already exists at ${KEYFILE_PATH}"
  exit 0
fi

command -v openssl >/dev/null 2>&1 || fail "openssl is required to generate mongo keyfile"

# MongoDB keyFile is a shared secret string (6 to 1024 chars). Avoid newlines.
TMP_FILE="$(mktemp)"
trap 'rm -f "${TMP_FILE}"' EXIT

# 756 base64 chars ~ 1000 bits. Keep within MongoDB limits and ensure no newline.
openssl rand -base64 756 | tr -d '\n' > "${TMP_FILE}" || fail "failed to generate random keyfile"

mv "${TMP_FILE}" "${KEYFILE_PATH}"
chmod 600 "${KEYFILE_PATH}" || fail "failed to chmod mongo keyfile"

echo "Generated MongoDB keyfile at ${KEYFILE_PATH} (chmod 600)"

