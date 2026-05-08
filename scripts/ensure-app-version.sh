#!/usr/bin/env bash
# Fail fast when APP_VERSION is missing or not semver — required for docker-compose image tags and builds.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT}/.env"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "ensure-app-version: .env is missing. Run: make ensure-env" >&2
  exit 1
fi

v=""
while IFS= read -r line || [[ -n "${line}" ]]; do
  [[ "${line}" =~ ^[[:space:]]*# ]] && continue
  if [[ "${line}" =~ ^APP_VERSION= ]]; then
    v="${line#APP_VERSION=}"
    v="${v%$'\r'}"
    # strip matching quotes
    if [[ "${v}" =~ ^\".*\"$ ]]; then
      v="${v:1:${#v}-2}"
    elif [[ "${v}" =~ ^\'.*\'$ ]]; then
      v="${v:1:${#v}-2}"
    fi
    break
  fi
done < "${ENV_FILE}"

v="$(echo -n "${v}" | tr -d '[:space:]')"
if [[ -z "${v}" ]]; then
  echo "ensure-app-version: APP_VERSION is required in .env (semver X.Y.Z). See env.example." >&2
  exit 1
fi
if ! echo "${v}" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "ensure-app-version: APP_VERSION must match X.Y.Z (got: ${v})" >&2
  exit 1
fi
