#!/usr/bin/env bash
# make status — one gather pass (stack services + stack ps), then print.

set -euo pipefail

_EIP_LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")/../lib" && pwd)"
# shellcheck source=lib/root.sh
source "${_EIP_LIB}/root.sh"
# shellcheck source=lib/require.sh
source "${_EIP_LIB}/require.sh"
# shellcheck source=lib/services.sh
source "${_EIP_LIB}/services.sh"
eip_cd_root

require_docker || exit 1

# Color when viewing in a terminal (NO_COLOR=1 to disable; FORCE_COLOR=1 to force).
USE_COLOR=0
if [ -n "${FORCE_COLOR:-}" ] || { [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; }; then
  USE_COLOR=1
fi
DETAIL_STYLE=""

# short|Friendly label
SWARM_APP=(
  "traefik|Traefik"
  "frontend|Website"
  "api|API"
  "websocket|Websocket"
  "ws-router|Websocket router"
  "worker|Background worker"
  "core|Core"
)
SWARM_HELPERS=(
  "traefik-docker-proxy|Traefik helper"
  "ws-docker-proxy|Websocket helper"
)
SWARM_DATA=(
  "mongo|Database"
  "redis|Cache"
  "nats|Messaging"
  "seaweedfs|Object store"
  "prometheus|Prometheus"
)
SWARM_OBS=(
  "grafana|Grafana"
  "loki|Loki"
  "alloy|Alloy"
  "alloy-docker-proxy|Alloy helper"
  "asynqmon|Job monitor"
  "nats-exporter|NATS exporter"
  "redis-exporter|Redis exporter"
  "mongodb-exporter|Mongo exporter"
  "node_exporter|Node exporter"
)

CRITICAL_BAD=0
OPS_BAD=0
STACK_UP=0

declare -A SW_EXISTS=()
declare -A SW_DESIRED=()
declare -A SW_RUNNING=()
declare -A SW_STARTING=()
declare -A SW_PORTS=()
# Newline-separated "name<TAB>desired<TAB>current<TAB>error" (docker order).
declare -A SW_TASKS=()

REPORT=()
emit() { REPORT+=("$*"); }

# Docker ports blob → published host ports: "80, 81, 443"
# Handles Swarm ranges (*:80-81->80-81/tcp) and skips expose-only (80/tcp).
friendly_ports() {
  local raw="$1"
  local -a out=()
  local -a parts=()
  local -A seen=()
  local part left pub start end p sorted

  [ -n "${raw}" ] || return 0
  IFS=',' read -r -a parts <<<"${raw}"
  for part in "${parts[@]}"; do
    part="${part// /}"
    [ -n "${part}" ] || continue
    # Host publish only — ignore image/expose-only "80/tcp".
    [[ "${part}" == *'->'* ]] || continue
    left="${part%%->*}"
    pub="${left##*:}"
    if [[ "${pub}" =~ ^([0-9]+)-([0-9]+)$ ]]; then
      start="${BASH_REMATCH[1]}"
      end="${BASH_REMATCH[2]}"
      # Guard absurd ranges from a bad parse.
      if [ "${start}" -le "${end}" ] && [ $((end - start)) -le 32 ]; then
        for ((p = start; p <= end; p++)); do
          if [ -z "${seen[${p}]:-}" ]; then
            seen["${p}"]=1
            out+=("${p}")
          fi
        done
      fi
    elif [[ "${pub}" =~ ^[0-9]+$ ]]; then
      if [ -z "${seen[${pub}]:-}" ]; then
        seen["${pub}"]=1
        out+=("${pub}")
      fi
    fi
  done
  if [ "${#out[@]}" -eq 0 ]; then
    return 0
  fi
  sorted="$(printf '%s\n' "${out[@]}" | LC_ALL=C sort -n)"
  sorted="${sorted//$'\n'/, }"
  echo "${sorted}"
}

# --- gather (at most 3 Docker queries) ---

gather() {
  local name replicas ports rd run des rest short desired current error
  local fports

  # 1) Swarm service list (also proves stack exists)
  if SWARM_SVC_RAW="$(docker stack services "${STACK_NAME}" --format '{{.Name}}	{{.Replicas}}	{{.Ports}}' 2>/dev/null)"; then
    STACK_UP=1
    while IFS=$'\t' read -r name replicas ports; do
      [ -n "${name}" ] || continue
      short="${name#"${STACK_NAME}"_}"
      SW_EXISTS["${short}"]=1
      rd="${replicas%% *}"
      run="${rd%%/*}"
      des="${rd##*/}"
      case "${des}" in
        ''|*[!0-9]*) des=0 ;;
      esac
      SW_DESIRED["${short}"]="${des}"
      # Prefer task counts below; keep ls running as fallback if no task rows.
      case "${run}" in
        ''|*[!0-9]*) run=0 ;;
      esac
      SW_RUNNING["${short}"]="${run}"
      SW_STARTING["${short}"]=0
      fports="$(friendly_ports "${ports}")"
      [ -n "${fports}" ] && SW_PORTS["${short}"]="${fports}"
    done <<<"${SWARM_SVC_RAW}"

    # 2) All stack tasks once
    SWARM_PS_RAW="$(docker stack ps "${STACK_NAME}" --no-trunc --format '{{.Name}}	{{.DesiredState}}	{{.CurrentState}}	{{.Error}}' 2>/dev/null || true)"
    if [ -n "${SWARM_PS_RAW}" ]; then
      # Reset running/starting; recount from desired-state=Running tasks.
      for short in "${!SW_EXISTS[@]}"; do
        SW_RUNNING["${short}"]=0
        SW_STARTING["${short}"]=0
      done
      while IFS=$'\t' read -r name desired current error; do
        [ -n "${name}" ] || continue
        rest="${name#"${STACK_NAME}"_}"
        short="${rest%%.*}"
        [ -n "${short}" ] || continue
        SW_TASKS["${short}"]+="${name}	${desired}	${current}	${error}"$'\n'
        if [ "${desired}" = "Running" ]; then
          case "${current}" in
            Running*) SW_RUNNING["${short}"]=$((${SW_RUNNING["${short}"]:-0} + 1)) ;;
            Preparing*|Starting*|Pending*|Assigned*|Accepted*|Ready*)
              SW_STARTING["${short}"]=$((${SW_STARTING["${short}"]:-0} + 1))
              ;;
          esac
        fi
      done <<<"${SWARM_PS_RAW}"
    fi
  fi

}

# --- format from gathered maps ---

note_signal() {
  local signal="$1"
  local critical="${2:-1}"
  case "${signal}" in
    OK) ;;
    *)
      if [ "${critical}" -eq 1 ]; then
        CRITICAL_BAD=$((CRITICAL_BAD + 1))
      else
        OPS_BAD=$((OPS_BAD + 1))
      fi
      ;;
  esac
}

# Visible-width padded signal (ANSI-safe).
style_signal() {
  local s="$1"
  if [ "${USE_COLOR}" -ne 1 ]; then
    printf '%-10s' "${s}"
    return
  fi
  case "${s}" in
    DOWN|PROBLEMS)
      # Bold white on red badge
      printf '\033[1;97;41m%-10s\033[0m' "${s}"
      ;;
    PARTIAL)
      printf '\033[1;30;43m%-10s\033[0m' "${s}"
      ;;
    OK\*)
      printf '\033[1;33m%-10s\033[0m' "${s}"
      ;;
    OK)
      printf '\033[1;32m%-10s\033[0m' "${s}"
      ;;
    *)
      printf '%-10s' "${s}"
      ;;
  esac
}

# label signal detail [ports]
emit_row() {
  local label="$1"
  local signal="$2"
  local detail="$3"
  local ports="${4:-}"
  local lab sig rest line

  DETAIL_STYLE=""
  case "${signal}" in
    DOWN|PROBLEMS) DETAIL_STYLE=down ;;
    PARTIAL) DETAIL_STYLE=partial ;;
  esac

  printf -v lab '%-26s' "${label}"
  sig="$(style_signal "${signal}")"
  if [ -n "${ports}" ]; then
    printf -v rest '%-22s ports %s' "${detail}" "${ports}"
  else
    rest="${detail}"
  fi

  if [ "${USE_COLOR}" -eq 1 ]; then
    case "${signal}" in
      DOWN|PROBLEMS)
        # Bold red label/detail around the inverse badge (don't wrap over badge reset).
        printf -v line '  \033[1;31m%s\033[0m %s \033[1;31m%s\033[0m' "${lab}" "${sig}" "${rest}"
        ;;
      PARTIAL)
        printf -v line '  \033[33m%s\033[0m %s \033[33m%s\033[0m' "${lab}" "${sig}" "${rest}"
        ;;
      *)
        printf -v line '  %s %s %s' "${lab}" "${sig}" "${rest}"
        ;;
    esac
  else
    printf -v line '  %s %s %s' "${lab}" "${sig}" "${rest}"
  fi
  emit "${line}"
}

emit_detail() {
  local line="      - $1"
  if [ "${USE_COLOR}" -eq 1 ]; then
    case "${DETAIL_STYLE}" in
      down) line=$'\033[31m'"${line}"$'\033[0m' ;;
      partial) line=$'\033[33m'"${line}"$'\033[0m' ;;
    esac
  fi
  emit "${line}"
}

emit_swarm_service() {
  local short="$1"
  local label="$2"
  local critical="$3"
  local desired running starting signal detail
  local line name desired_state current error shown

  desired="${SW_DESIRED[${short}]:-0}"
  running="${SW_RUNNING[${short}]:-0}"
  starting="${SW_STARTING[${short}]:-0}"

  if [ "${STACK_UP}" -ne 1 ]; then
    signal="DOWN"
    detail="app stack not deployed"
  elif [ -z "${SW_EXISTS[${short}]:-}" ]; then
    signal="DOWN"
    detail="missing from stack (should be there)"
  elif [ "${running}" -ge "${desired}" ] && [ "${desired}" -gt 0 ]; then
    signal="OK"
    detail="${running}/${desired} up"
  elif [ "${running}" -gt 0 ] || [ "${starting}" -gt 0 ]; then
    signal="PARTIAL"
    if [ "${starting}" -gt 0 ]; then
      detail="${running}/${desired} up (${starting} starting)"
    else
      detail="${running}/${desired} up"
    fi
  else
    signal="DOWN"
    detail="0/${desired} up"
  fi

  emit_row "${label}" "${signal}" "${detail}" "${SW_PORTS[${short}]:-}"
  note_signal "${signal}" "${critical}"

  shown=0
  while IFS=$'\t' read -r name desired_state current error; do
    [ -n "${name}" ] || continue
    if [ "${signal}" = "OK" ]; then
      [ "${desired_state}" = "Running" ] || continue
      case "${current}" in
        Running*) ;;
        *) continue ;;
      esac
    else
      # Unhealthy: a few recent tasks (any desired state) for this service only.
      if [ "${shown}" -ge 3 ]; then
        break
      fi
    fi
    line="${name}  ${current}"
    if [ -n "${error}" ]; then
      line="${line}  (${error})"
    fi
    emit_detail "${line}"
    shown=$((shown + 1))
  done <<<"${SW_TASKS[${short}]:-}"
}

emit_swarm_group() {
  local title="$1"
  local critical="$2"
  shift 2
  local entry
  emit "── ${title} ──"
  for entry in "$@"; do
    emit_swarm_service "${entry%%|*}" "${entry#*|}" "${critical}"
  done
  emit ""
}

emit_summary() {
  local mode="live"
  if [ -f "${STACK_MODE_FILE}" ]; then
    mode="$(tr -d '[:space:]' <"${STACK_MODE_FILE}")"
    [ -n "${mode}" ] || mode="live"
  fi

  emit "── Summary ──"
  if [ "${STACK_UP}" -ne 1 ]; then
    emit_row "Overall" "DOWN" "nothing is running — try: make up"
  elif [ "${CRITICAL_BAD}" -eq 0 ] && [ "${OPS_BAD}" -eq 0 ]; then
    emit_row "Overall" "OK" "everything expected is up"
  elif [ "${CRITICAL_BAD}" -eq 0 ]; then
    emit_row "Overall" "OK*" "app is up; ${OPS_BAD} monitoring/tool issue(s)"
  else
    emit_row "Overall" "PROBLEMS" "${CRITICAL_BAD} important service(s) not healthy"
  fi
  if [ "${STACK_UP}" -eq 1 ]; then
    emit_row "Mode" "${mode}" "stack ${STACK_NAME} deployed"
  else
    emit_row "Mode" "${mode}" "stack not deployed"
  fi
  emit ""
  if [ "${CRITICAL_BAD}" -gt 0 ]; then
    emit "Next step: make up   (or make logs / make restart for one service)"
    emit ""
  fi
}

gather

emit "Eve Industry Planner — status"
emit "Copy everything below if you need help."
emit ""
emit_swarm_group "App" 1 "${SWARM_APP[@]}"
emit_swarm_group "App helpers" 1 "${SWARM_HELPERS[@]}"
emit_swarm_group "Data layer" 1 "${SWARM_DATA[@]}"
# Obs is an addon — only list when at least one obs service is on the stack.
_obs_present=0
for _entry in "${SWARM_OBS[@]}"; do
  if [ -n "${SW_EXISTS[${_entry%%|*}]:-}" ]; then
    _obs_present=1
    break
  fi
done
if [ "${_obs_present}" -eq 1 ]; then
  emit_swarm_group "Observability" 0 "${SWARM_OBS[@]}"
fi
unset _obs_present _entry
emit_summary

printf '%s\n' "${REPORT[@]}"
exit 0
