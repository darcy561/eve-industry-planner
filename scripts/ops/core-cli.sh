#!/bin/bash
# Drop into / run commands on the running Swarm core task (post-handoff owner).
# Mid-roll: announce, wait until Swarm update completes and exactly one
# core container remains, then exec. Fail on pause/rollback/timeout.
#
# One-shots go through the container `tasks` wrapper (same as old
# `docker exec … tasks <subcommand>`), so you do not type `tasks` yourself:
#
#   make cli ARGS='list'
#   make cli CMD='sdeVersion'
#   scripts/ops/core-cli.sh -- list
#
# Interactive shell (escape for ad-hoc):
#   make cli
#   make cli ARGS='shell'
#
# Env:
#   EIP_STACK_NAME       default eip → service eip_core
#   EIP_CORE_SERVICE     override full service name
#   EIP_CORE_CONTAINER   skip discovery; exec this name/id
#   EIP_CLI_WAIT_SEC     handoff wait timeout (default 180)
#   EIP_CLI_SHELL        shell when interactive (default: bash then sh)

set -euo pipefail

_EIP_LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")/../lib" && pwd)"
# shellcheck source=../lib/require.sh
source "${_EIP_LIB}/require.sh"

# STACK_NAME from lib/paths.sh (via require.sh).
SERVICE="${EIP_CORE_SERVICE:-${STACK_NAME}_core}"
WAIT_SEC="${EIP_CLI_WAIT_SEC:-180}"
POLL_SEC="${EIP_CLI_POLL_SEC:-2}"

# Same local helpers as other ops/*.sh (not extracted to lib — tiny + wording differs).
fail() { echo "Error: $*" >&2; exit 1; }
info() { echo "$*" >&2; }

require_docker || exit 1
require_swarm_active || exit 1

if ! docker service inspect "${SERVICE}" >/dev/null 2>&1; then
  fail "service '${SERVICE}' not found (is the stack deployed?)"
fi

update_state() {
  docker service inspect "${SERVICE}" --format '{{if .UpdateStatus}}{{.UpdateStatus.State}}{{end}}' 2>/dev/null || true
}

update_message() {
  docker service inspect "${SERVICE}" --format '{{if .UpdateStatus}}{{.UpdateStatus.Message}}{{end}}' 2>/dev/null || true
}

# Running container names for this Swarm service (stable label filter).
list_running() {
  docker ps \
    --filter "label=com.docker.swarm.service.name=${SERVICE}" \
    --filter "status=running" \
    --format '{{.Names}}'
}

count_running() {
  list_running | awk 'NF' | wc -l | tr -d ' '
}

fail_bad_update() {
  local state="$1"
  local msg
  msg="$(update_message)"
  if [ -n "${msg}" ]; then
    fail "core handoff issue: UpdateStatus.State=${state} (${msg})"
  fi
  fail "core handoff issue: UpdateStatus.State=${state}"
}

# True if sole running name is absent from baseline snapshot (pre-roll owners).
is_new_sole_owner() {
  local sole="$1"
  local baseline="$2"
  [ -n "${sole}" ] || return 1
  if [ -z "${baseline}" ]; then
    return 0
  fi
  printf '%s\n' "${baseline}" | grep -Fxq "${sole}" && return 1
  return 0
}

# Wait until Swarm handoff leaves exactly one running core that is the post-roll owner.
# While UpdateStatus=updating, a single still-running *old* task is not enough — keep waiting
# until that name is gone (or update completes) so we never attach mid-roll to the draining leader.
wait_for_stable_owner() {
  local baseline="$1"
  local state
  local n
  local sole
  local elapsed=0

  info "core is mid-roll (Swarm update in progress); waiting for new task to become the sole owner..."

  while [ "${elapsed}" -lt "${WAIT_SEC}" ]; do
    state="$(update_state)"
    case "${state}" in
      paused|rollback_started|rollback_paused)
        fail_bad_update "${state}"
        ;;
    esac

    n="$(count_running)"
    sole="$(list_running | awk 'NF' | head -n1)"

    if [ "${n}" -eq 1 ]; then
      if [ "${state}" = "completed" ] || [ -z "${state}" ] || is_new_sole_owner "${sole}" "${baseline}"; then
        info "handoff complete; attaching to ${sole}"
        return 0
      fi
      # Still updating and the only task is a pre-roll container — wait for replacement.
    elif [ "${n}" -eq 0 ] && [ "${state}" != "updating" ]; then
      fail "no running '${SERVICE}' containers"
    fi

    sleep "${POLL_SEC}"
    elapsed=$((elapsed + POLL_SEC))
  done

  state="$(update_state)"
  n="$(count_running)"
  fail "timed out after ${WAIT_SEC}s waiting for core handoff (state=${state:-none}, running=${n})"
}

resolve_container() {
  if [ -n "${EIP_CORE_CONTAINER:-}" ]; then
    printf '%s\n' "${EIP_CORE_CONTAINER}"
    return 0
  fi

  local state
  local n
  local baseline=""
  state="$(update_state)"
  n="$(count_running)"
  case "${state}" in
    paused|rollback_started|rollback_paused)
      fail_bad_update "${state}"
      ;;
  esac

  if [ "${state}" = "updating" ] || [ "${n}" -ne 1 ]; then
    if [ "${state}" = "updating" ]; then
      baseline="$(list_running)"
    fi
    wait_for_stable_owner "${baseline}"
  fi

  local names
  names="$(list_running)"
  n="$(printf '%s\n' "${names}" | awk 'NF' | wc -l | tr -d ' ')"
  if [ "${n}" -eq 0 ]; then
    fail "no running '${SERVICE}' containers"
  fi
  if [ "${n}" -ne 1 ]; then
    fail "expected 1 running '${SERVICE}' container after handoff, found ${n}: $(printf '%s' "${names}" | tr '\n' ' ')"
  fi
  printf '%s\n' "${names}" | head -n1
}

run_tasks() {
  # Same entrypoint as historical `docker exec <core> tasks …`
  if [ "$#" -gt 0 ] && [ "$1" = "tasks" ]; then
    exec docker exec -i "${CONTAINER}" "$@"
  fi
  exec docker exec -i "${CONTAINER}" tasks "$@"
}

open_shell() {
  local shell="${EIP_CLI_SHELL:-}"
  if [ -z "${shell}" ]; then
    if docker exec "${CONTAINER}" sh -c 'command -v bash >/dev/null 2>&1'; then
      shell=bash
    else
      shell=sh
    fi
  fi
  info "interactive shell — for CLI jobs prefer: make cli ARGS='"'list'"' (tasks is implied)"
  exec docker exec -it "${CONTAINER}" "${shell}"
}

CONTAINER="$(resolve_container)"
info "core: ${CONTAINER}"

# One-shot: CMD= from make (subcommand only, e.g. CMD='list').
if [ -n "${CMD:-}" ]; then
  # shellcheck disable=SC2086
  set -- ${CMD}
  if [ "$#" -eq 1 ] && [ "$1" = "shell" ]; then
    open_shell
  fi
  run_tasks "$@"
fi

if [ "$#" -gt 0 ]; then
  if [ "$1" = "--" ]; then
    shift
  fi
  if [ "$#" -gt 0 ]; then
    if [ "$#" -eq 1 ] && [ "$1" = "shell" ]; then
      open_shell
    fi
    run_tasks "$@"
  fi
fi

open_shell
