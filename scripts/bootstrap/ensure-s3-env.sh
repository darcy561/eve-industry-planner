#!/usr/bin/env bash
# Ensure S3 credentials exist in .env.
# Safe to run repeatedly.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "${ROOT}"

if [ ! -f .env ]; then
  echo "Error: .env missing" >&2
  exit 1
fi

gen_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 36 | tr -d '\n' | tr '+/' '-_' | tr -d '='
  else
    LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 48
  fi
}

read_key() {
  awk -F= -v k="$1" '$1 == k { sub(/^[^=]*=/, ""); print; exit }' .env
}

ACCESS="$(read_key S3_ACCESS_KEY)"
if [ -z "${ACCESS}" ]; then
  ACCESS="$(read_key MINIO_ROOT_USER)"
  if [ -z "${ACCESS}" ]; then
    ACCESS="eipobject"
  fi
  printf 'S3_ACCESS_KEY=%s\n' "${ACCESS}" >>.env
  echo "Added S3_ACCESS_KEY=${ACCESS} to .env" >&2
fi

SECRET="$(read_key S3_SECRET_KEY)"
if [ -z "${SECRET}" ] || [ "${SECRET}" = "auto-generate-me" ]; then
  LEGACY="$(read_key MINIO_ROOT_PASSWORD)"
  if [ -n "${LEGACY}" ] && [ "${LEGACY}" != "auto-generate-me" ] && [ -z "${SECRET}" ]; then
    printf 'S3_SECRET_KEY=%s\n' "${LEGACY}" >>.env
    echo "Migrated MINIO_ROOT_PASSWORD → S3_SECRET_KEY" >&2
  else
    GEN="$(gen_secret)"
    if grep -q '^S3_SECRET_KEY=' .env; then
      sed -i.bak "s|^S3_SECRET_KEY=.*|S3_SECRET_KEY=${GEN}|" .env && rm -f .env.bak
    else
      printf 'S3_SECRET_KEY=%s\n' "${GEN}" >>.env
    fi
    echo "Generated S3_SECRET_KEY in .env" >&2
  fi
fi
