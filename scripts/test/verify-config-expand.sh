#!/usr/bin/env bash
# One-shot config parity check (.env APP_VERSION + eip.config bridges → stack expand).
set -euo pipefail

cd "$(dirname "$0")/../../.."
_EIP_LIB="$(pwd)/scripts/lib"
# shellcheck source=scripts/lib/env.sh
source "${_EIP_LIB}/env.sh"
# shellcheck source=scripts/lib/eip-config.sh
source "${_EIP_LIB}/eip-config.sh"
# shellcheck source=scripts/lib/images.sh
source "${_EIP_LIB}/images.sh"
# shellcheck source=scripts/lib/stack-expand.sh
source "${_EIP_LIB}/stack-expand.sh"

echo "=== ensure-app-version ==="
./scripts/swarm/ensure-app-version.sh

echo ""
echo "=== .env APP_VERSION (SoT) ==="
env_ver="$(resolve_app_version --required)"
echo ".env APP_VERSION=${env_ver}"
if [ -f .eip-sync.env ]; then
  echo "WARN: stale .eip-sync.env present (ignored; expand uses ephemeral sync-env)"
fi
if grep -qE '^app_version:' eip.config.yaml 2>/dev/null; then
  echo "ERROR: eip.config.yaml must not contain app_version"
  exit 1
fi

SYNC_TMP="$(eip_sync_env_temp)"
# shellcheck disable=SC2064
trap 'rm -f "${SYNC_TMP}" "${TMP:-}" "${TMP2:-}" .eip-local-build.env.test' EXIT

got_api_max="$(read_env_key "${SYNC_TMP}" EIP_API_CAPACITY_MAX)"
got_ws_min="$(read_env_key "${SYNC_TMP}" EIP_WEBSOCKET_REPLICAS)"
got_ws_max="$(read_env_key "${SYNC_TMP}" EIP_WEBSOCKET_CAPACITY_MAX)"
got_http="$(read_env_key "${SYNC_TMP}" EIP_HTTP_PORT)"
echo "bridges: API_MAX=${got_api_max} WS_REP=${got_ws_min} WS_MAX=${got_ws_max} HTTP=${got_http}"
[ "${got_api_max}" = "6" ] || { echo "bad API max"; exit 1; }
[ "${got_ws_min}" = "2" ] || { echo "bad WS min"; exit 1; }
[ "${got_ws_max}" = "4" ] || { echo "bad WS max"; exit 1; }
[ "${got_http}" = "80" ] || { echo "bad http"; exit 1; }

echo ""
echo "=== live expand ==="
TMP="$(mktemp)"
expand_stack_files "${TMP}" docker-stack.yml
echo "images:"
grep -E '^\s+image:' "${TMP}"
# APP_VERSION task env on bakeable app roles (api/websocket/worker/ws-router/core/frontend).
n="$(grep -c "APP_VERSION: ${env_ver}" "${TMP}" || true)"
echo "APP_VERSION env count=${n} (expect 6)"
[ "${n}" -eq 6 ] || { echo "expected APP_VERSION on 6 app services"; exit 1; }
grep -q "ghcr.io/darcy561/eve-industry-planner-api:${env_ver}" "${TMP}" || { echo "live api image wrong"; exit 1; }
grep -q "ghcr.io/darcy561/eve-industry-planner-frontend:${env_ver}" "${TMP}" || { echo "live frontend image wrong"; exit 1; }
if grep -qE 'env_file:' "${TMP}"; then
  echo "ERROR: expanded stack must not use env_file (secrets are Swarm secrets)"
  exit 1
fi
if grep -qE 'REDIS_PASSWORD:' "${TMP}"; then
  echo "ERROR: REDIS_PASSWORD must not appear as task environment (secret mount only)"
  exit 1
fi

if ! grep -E 'WORKER_ASYNQ_CONCURRENCY:[[:space:]]*"?50"?' "${TMP}" >/dev/null; then
  echo "worker concurrency default missing from stack"; exit 1
fi
if ! grep -E 'WS_SLOT_CLIENT_CUTOFF:[[:space:]]*"?2000"?' "${TMP}" >/dev/null; then
  echo "websocket cutoff default missing from stack"; exit 1
fi
if ! grep -E 'eip\.capacity\.max:[[:space:]]*"?'"${got_api_max}" "${TMP}" >/dev/null; then
  echo "api capacity max label not expanded"; exit 1
fi
if ! grep -E 'replicas:[[:space:]]*'"${got_ws_min}" "${TMP}" >/dev/null; then
  echo "websocket replicas not expanded"; exit 1
fi

echo ""
echo "=== #dev expand ==="
cat >.eip-local-build.env.test <<EOF
APP_VERSION=${env_ver}
TAG_api=${env_ver}-20991231235959
TAG_websocket=${env_ver}-20991231235959
TAG_worker=${env_ver}-20991231235958
TAG_ws_router=${env_ver}-20991231235959
TAG_core=${env_ver}-20991231235959
TAG_frontend=${env_ver}-20991231235959
EOF
STACK_EXPAND_EXTRA_ENV_FILES=(.eip-local-build.env.test)
TMP2="$(mktemp)"
expand_stack_files "${TMP2}" docker-stack.yml docker-stack.dev.yml
echo "images:"
grep -E '^\s+image:' "${TMP2}"
grep -q "eve-industry-planner-api:${env_ver}-20991231235959" "${TMP2}" || { echo "dev api tag wrong"; exit 1; }
grep -q "eve-industry-planner-worker:${env_ver}-20991231235958" "${TMP2}" || { echo "dev worker per-role tag wrong"; exit 1; }
grep -q "eve-industry-planner-frontend:${env_ver}-20991231235959" "${TMP2}" || { echo "dev frontend tag wrong"; exit 1; }
if grep -q "ghcr.io/darcy561/eve-industry-planner-api" "${TMP2}"; then
  echo "dev expand still has ghcr api"
  exit 1
fi
grep -q "traefik:v3" "${TMP2}" || { echo "traefik pin missing"; exit 1; }

echo ""
echo "CONFIG_OK"
