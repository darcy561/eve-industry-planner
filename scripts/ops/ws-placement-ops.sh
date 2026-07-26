#!/bin/bash
# #21 WS placement ops: cordon / uncordon / pin / unpin / move / evacuate (Redis overlays).
# Router honors these on place (see docs/swarm/WS_ROUTER.md).
# Evacuate rewrites placement keys + cordons source. Cordon/evacuate also PUBLISH
# eip:ws:drain:v1 so the websocket slot force-closes live sockets (#8); SPA reconnects
# via router onto an eligible slot (session handoff TTL ~25s).
#
# Usage:
#   scripts/ops/ws-placement-ops.sh status
#   scripts/ops/ws-placement-ops.sh cordon websocket-2
#   scripts/ops/ws-placement-ops.sh uncordon websocket-2
#   scripts/ops/ws-placement-ops.sh pin account:123 websocket-1
#   scripts/ops/ws-placement-ops.sh unpin account:123
#   scripts/ops/ws-placement-ops.sh move account:123 websocket-1
#   scripts/ops/ws-placement-ops.sh evacuate websocket-2 [websocket-1]
#   make ws-placement-ops ARGS='evacuate websocket-2'

set -euo pipefail

_EIP_LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")/../lib" && pwd)"
# shellcheck source=../lib/redis.sh
source "${_EIP_LIB}/redis.sh"

# Fixed contracts — must match services/shared/wsplacement (Go SoT).
PLACE_PREFIX="eip:ws:place:v1:"
PIN_PREFIX="eip:ws:pin:v1:"
CORDON_PREFIX="eip:ws:cordon:v1:"
FULL_PREFIX="eip:ws:full:v1:"
DRAIN_CHANNEL="eip:ws:drain:v1"
PLACE_TTL_SEC="86400" # == shared/wsplacement.PlacementTTL (24h)

# SET cordon then wake the matching websocket replica (force-close locals).
# PUBLISH JSON so the client please_reconnect frame can say cordon vs evacuate.
cordon_and_signal() {
  local slot="$1"
  local action="${2:-cordon}"
  redis_cli SET "${CORDON_PREFIX}${slot}" "1" >/dev/null
  # Compact JSON — keep it a single redis-cli arg (no spaces that bash would split).
  redis_cli PUBLISH "${DRAIN_CHANNEL}" "{\"slot\":\"${slot}\",\"action\":\"${action}\",\"via\":\"ws-placement-ops\"}" >/dev/null
}

fail() { echo "FAIL: $*" >&2; exit 1; }
info() { echo "$*"; }

usage() {
  sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'
  exit 2
}

[ $# -ge 1 ] || usage
CMD="$1"
shift

eip_redis_setup || fail "redis setup failed"

require_slot() {
  case "$1" in
    websocket-*) ;;
    *) fail "slot must look like websocket-N (got '$1')" ;;
  esac
}

list_placements_for_slot() {
  local slot="$1"
  # KEYS is fine for single-host evacuate ops (not request hot path).
  local keys
  keys="$(redis_cli --raw KEYS "${PLACE_PREFIX}*" | tr -d '\r' || true)"
  if [ -z "${keys}" ]; then
    return 0
  fi
  while IFS= read -r key; do
    [ -n "${key}" ] || continue
    val="$(redis_raw GET "${key}")"
    if [ "${val}" = "${slot}" ]; then
      echo "${key#"${PLACE_PREFIX}"}"
    fi
  done <<< "${keys}"
}

pick_target() {
  local from="$1"
  local prefer="${2:-}"
  if [ -n "${prefer}" ]; then
    echo "${prefer}"
    return
  fi
  # Prefer the other known slot from redis keys/cordon list, else websocket-1 vs 2 heuristic.
  local candidates
  candidates="$(redis_cli --raw KEYS "${CORDON_PREFIX}*" 2>/dev/null || true)"
  # Ask docker for running websocket tasks if available
  local slots
  slots="$(docker service ps eip_websocket --format '{{.Name}} {{.CurrentState}}' 2>/dev/null \
    | awk '/Running/ {print $1}' | sed -E 's/.*\.([0-9]+)\..*/websocket-\1/' | sort -u || true)"
  if [ -z "${slots}" ]; then
    slots=$'websocket-1\nwebsocket-2'
  fi
  while IFS= read -r s; do
    [ -n "${s}" ] || continue
    [ "${s}" = "${from}" ] && continue
    # skip if cordoned
    if [ "$(redis_raw EXISTS "${CORDON_PREFIX}${s}")" = "1" ]; then
      continue
    fi
    echo "${s}"
    return
  done <<< "${slots}"
  fail "no eligible target slot for evacuate from ${from}"
}

case "${CMD}" in
  status)
    info "Redis container: ${REDIS_C}"
    info "--- cordoned slots ---"
    redis_cli --raw KEYS "${CORDON_PREFIX}*" | tr -d '\r' | sed "s|^${CORDON_PREFIX}||" || true
    info "--- full slots (client_cutoff hint) ---"
    redis_cli --raw KEYS "${FULL_PREFIX}*" | tr -d '\r' | sed "s|^${FULL_PREFIX}||" || true
    info "--- pins (affinity -> slot) ---"
    pins="$(redis_cli --raw KEYS "${PIN_PREFIX}*" | tr -d '\r' || true)"
    if [ -n "${pins}" ]; then
      while IFS= read -r k; do
        [ -n "${k}" ] || continue
        echo "${k#"${PIN_PREFIX}"} -> $(redis_raw GET "${k}")"
      done <<< "${pins}"
    fi
    info "--- placement sample (first 20) ---"
    # KEYS is acceptable for single-host ops status (not hot path).
    places="$(redis_cli --raw KEYS "${PLACE_PREFIX}*" | tr -d '\r' | head -n 20 || true)"
    if [ -n "${places}" ]; then
      while IFS= read -r k; do
        [ -n "${k}" ] || continue
        echo "${k#"${PLACE_PREFIX}"} -> $(redis_raw GET "${k}")"
      done <<< "${places}"
    fi
    ;;
  cordon)
    [ $# -ge 1 ] || usage
    require_slot "$1"
    cordon_and_signal "$1" "cordon"
    info "cordoned $1 (drain signal published on ${DRAIN_CHANNEL})"
    ;;
  uncordon)
    [ $# -ge 1 ] || usage
    require_slot "$1"
    redis_cli DEL "${CORDON_PREFIX}$1" >/dev/null
    info "uncordoned $1"
    ;;
  pin)
    [ $# -ge 2 ] || usage
    aff="$1"
    slot="$2"
    require_slot "${slot}"
    redis_cli SET "${PIN_PREFIX}${aff}" "${slot}" >/dev/null
    redis_cli SET "${PLACE_PREFIX}${aff}" "${slot}" EX "${PLACE_TTL_SEC}" >/dev/null
    info "pinned ${aff} -> ${slot}"
    ;;
  unpin)
    [ $# -ge 1 ] || usage
    redis_cli DEL "${PIN_PREFIX}$1" >/dev/null
    info "unpinned $1"
    ;;
  move)
    [ $# -ge 2 ] || usage
    aff="$1"
    slot="$2"
    require_slot "${slot}"
    redis_cli SET "${PLACE_PREFIX}${aff}" "${slot}" EX "${PLACE_TTL_SEC}" >/dev/null
    info "moved placement ${aff} -> ${slot} (live sockets reconnect later)"
    ;;
  evacuate)
    [ $# -ge 1 ] || usage
    from="$1"
    require_slot "${from}"
    to="$(pick_target "${from}" "${2:-}")"
    require_slot "${to}"
    [ "${from}" != "${to}" ] || fail "evacuate target must differ from source"
    # Cordon + drain signal so live sockets reconnect; rewrite placements.
    cordon_and_signal "${from}" "evacuate"
    moved=0
    while IFS= read -r aff; do
      [ -n "${aff}" ] || continue
      redis_cli SET "${PLACE_PREFIX}${aff}" "${to}" EX "${PLACE_TTL_SEC}" >/dev/null
      # Drop pin that forced the dying slot
      pin="$(redis_raw GET "${PIN_PREFIX}${aff}" 2>/dev/null || true)"
      if [ "${pin}" = "${from}" ]; then
        redis_cli DEL "${PIN_PREFIX}${aff}" >/dev/null
      fi
      moved=$((moved + 1))
      info "  ${aff}: ${from} -> ${to}"
    done < <(list_placements_for_slot "${from}")
    info "evacuated ${moved} placement(s) from ${from} -> ${to} (source cordoned + drain signal; clients should force-reconnect)"
    ;;
  *)
    usage
    ;;
esac
