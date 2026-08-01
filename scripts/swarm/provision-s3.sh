#!/usr/bin/env bash
# Provision / verify S3 buckets after the data fragment is up (idempotent).
# Called from bring-up (make up / make dev). Day-2 may call with --check-only.
#
# No throwaway aws-cli containers: weed mini creates buckets from S3_BUCKET env;
# this script docker exec's into the seaweedfs Swarm task to wait + verify/create.

set -euo pipefail

_EIP_LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")/../lib" && pwd)"
# shellcheck source=lib/root.sh
source "${_EIP_LIB}/root.sh"
# shellcheck source=lib/require.sh
source "${_EIP_LIB}/require.sh"
# shellcheck source=lib/s3.sh
source "${_EIP_LIB}/s3.sh"
eip_cd_root

# Keep in sync with objectstore.Bucket* and docker-stack.data.yml S3_BUCKET=
S3_BUCKET="static-data"
S3_TEST_BUCKET="static-data-test"

CHECK_ONLY=0
for arg in "$@"; do
  case "${arg}" in
    --check-only) CHECK_ONLY=1 ;;
    -h|--help)
      echo "Usage: $0 [--check-only]"
      echo "  Ensure S3 buckets ${S3_BUCKET} + ${S3_TEST_BUCKET} via weed shell in eip_seaweedfs."
      exit 0
      ;;
  esac
done

require_file "${ENV_FILE}" || exit 1
require_docker || exit 1
resolve_s3_creds

if [ -z "${S3_ACCESS_KEY}" ] || [ -z "${S3_SECRET_KEY}" ]; then
  echo "Error: S3_ACCESS_KEY / S3_SECRET_KEY must be set in ${ENV_FILE}" >&2
  exit 1
fi

wait_s3_live 90
cid="$(eip_seaweedfs_container)"
if [ -z "${cid}" ]; then
  echo "Error: no running ${STACK_NAME}_seaweedfs task" >&2
  exit 1
fi

for b in "${S3_BUCKET}" "${S3_TEST_BUCKET}"; do
  if [ "${CHECK_ONLY}" -eq 1 ]; then
    if ! eip_s3_bucket_exists "${cid}" "${b}"; then
      echo "Error: bucket ${b} missing — run make up / make dev (or ./scripts/swarm/provision-s3.sh)" >&2
      exit 1
    fi
    eip_vlog "OK: bucket ${b} exists"
  else
    eip_s3_ensure_bucket "${cid}" "${b}"
  fi
done

eip_vlog "Buckets ready: ${S3_BUCKET}, ${S3_TEST_BUCKET}"
