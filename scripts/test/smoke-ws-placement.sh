#!/bin/bash
# #4 acceptance smoke: same eip_tenant_affinity -> same websocket slot (Redis placement).
# Prerequisites: stack healthy (`make up` or `make dev`), >=2 websocket replicas.
# See docs/swarm/WS_ROUTER.md / STACK.md.
#
# Usage:
#   scripts/test/smoke-ws-placement.sh
#   make smoke-ws-placement
#
# Optional env:
#   EIP_SMOKE_BASE_URL   default http://127.0.0.1
#   EIP_SMOKE_AFFINITY   default account:smoke-4-acceptance
#   EIP_ENV_FILE         default .env
#   EIP_REDIS_CONTAINER  default: first running container matching name redisDB / redis

set -euo pipefail

_EIP_LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")/../lib" && pwd)"
# shellcheck source=../lib/require.sh
source "${_EIP_LIB}/require.sh"
# shellcheck source=../lib/redis.sh
source "${_EIP_LIB}/redis.sh"

BASE_URL="${EIP_SMOKE_BASE_URL:-http://127.0.0.1}"
AFFINITY="${EIP_SMOKE_AFFINITY:-account:smoke-4-acceptance}"
# Fixed contracts — must match services/shared/wsplacement.
PREFIX="eip:ws:place:v1:"
COOKIE_NAME="eip_tenant_affinity"
KEY="${PREFIX}${AFFINITY}"

MAKE_DEV="make ""dev"

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "OK: $*"; }

require_docker || fail "docker is required"
if ! command -v curl >/dev/null 2>&1; then
  fail "curl is required"
fi

eip_redis_setup || fail "redis setup failed"

ROUTER_C="$(docker ps --format '{{.Names}}' | grep -E 'eip_ws-router|ws-router' | head -n1 || true)"
[ -n "${ROUTER_C}" ] || fail "eip_ws-router task not running — bring up with make up / ${MAKE_DEV}"

router_metrics() {
  docker exec "${ROUTER_C}" wget -qO- "http://127.0.0.1:8080/metrics" 2>/dev/null || true
}

ws_hit() {
  # Placement runs before backend auth; 401/426/etc still exercise Redis place/hit.
  curl -sS -o /dev/null -w "%{http_code}" \
    --http1.1 \
    -H "Connection: Upgrade" \
    -H "Upgrade: websocket" \
    -H "Sec-WebSocket-Version: 13" \
    -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
    -H "Cookie: ${COOKIE_NAME}=${AFFINITY}" \
    "${BASE_URL}/ws" || echo "000"
}

echo "== #4 WS placement smoke =="
echo "base=${BASE_URL} affinity=${AFFINITY} redis=${REDIS_C} router=${ROUTER_C}"

code="$(curl -sS -o /dev/null -w "%{http_code}" "${BASE_URL}/ping" || echo 000)"
[ "${code}" = "200" ] || fail "Traefik /ping expected 200 got ${code}"

slots="$(router_metrics | awk '/^eip_ws_router_backend_slots / {print $2; exit}')"
[ -n "${slots}" ] || fail "could not read eip_ws_router_backend_slots from router /metrics"
slots_i="${slots%%.*}"
[ "${slots_i}" -ge 2 ] || fail "need >=2 websocket backends for co-location check (got ${slots})"
pass "backend_slots=${slots}"

redis_cli DEL "${KEY}" >/dev/null
val="$(redis_cli GET "${KEY}" || true)"
[ -z "${val}" ] || [ "${val}" = "(nil)" ] || fail "expected empty placement after DEL, got '${val}'"
pass "cleared ${KEY}"

code1="$(ws_hit)"
slot1="$(redis_cli GET "${KEY}")"
[ -n "${slot1}" ] && [ "${slot1}" != "(nil)" ] || fail "after first /ws: Redis placement empty (http=${code1})"
case "${slot1}" in
  websocket-*) ;;
  *) fail "unexpected slot id '${slot1}' (want websocket-N)" ;;
esac
pass "first place -> ${slot1} (http=${code1})"

code2="$(ws_hit)"
slot2="$(redis_cli GET "${KEY}")"
[ "${slot2}" = "${slot1}" ] || fail "second /ws changed placement ${slot1} -> ${slot2} (http=${code2})"
pass "second hit -> same ${slot2} (http=${code2})"

AFF2="${AFFINITY}-other"
KEY2="${PREFIX}${AFF2}"
redis_cli DEL "${KEY2}" >/dev/null
curl -sS -o /dev/null -w "" \
  --http1.1 \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  -H "Cookie: ${COOKIE_NAME}=${AFF2}" \
  "${BASE_URL}/ws" >/dev/null || true
slot_other="$(redis_cli GET "${KEY2}")"
[ -n "${slot_other}" ] && [ "${slot_other}" != "(nil)" ] || fail "other affinity did not place"
pass "other affinity placed -> ${slot_other}"

hits="$(router_metrics | awk '/^eip_ws_router_placement_hit_total / {print $2; exit}')"
miss="$(router_metrics | awk '/^eip_ws_router_placement_miss_total / {print $2; exit}')"
pass "metrics hit=${hits:-?} miss=${miss:-?} (informational)"

redis_cli DEL "${KEY}" "${KEY2}" >/dev/null
pass "cleaned smoke keys"

echo ""
echo "PASS: same affinity ${AFFINITY} stayed on ${slot1} across two /ws upgrades (#4 acceptance)"
