# shellcheck shell=bash
# List / resolve / pick running app services (short names, not container IDs).

# shellcheck source=paths.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/paths.sh"
# shellcheck source=require.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/require.sh"

# Prefer order for whole-stack rolling restart (short names).
EIP_RESTART_PREFER=(traefik api websocket worker ws-router core mongo redis nats seaweedfs)

eip_stack_exists() {
  docker stack ls --format '{{.Name}}' 2>/dev/null | grep -qx "${STACK_NAME}"
}

# Wait until stack name disappears from `docker stack ls` (stack rm is async).
# Arg is seconds (default 120), not loop iterations.
eip_wait_stack_gone() {
  local max_sec="${1:-120}"
  local elapsed=0
  while eip_stack_exists; do
    if [ "${elapsed}" -ge "${max_sec}" ]; then
      echo "Warning: stack ${STACK_NAME} still listed after ${max_sec}s — continuing" >&2
      return 1
    fi
    sleep 2
    elapsed=$((elapsed + 2))
  done
  return 0
}

# Print short service names that currently have running tasks (one per line).
eip_list_running_services() {
  local name short
  local -A seen=()

  if eip_stack_exists; then
    while IFS= read -r name; do
      [ -n "${name}" ] || continue
      if ! docker service ps "${name}" --filter desired-state=running --format '{{.ID}}' 2>/dev/null | grep -q .; then
        continue
      fi
      short="${name#"${STACK_NAME}"_}"
      seen["${short}"]=1
    done < <(docker stack services "${STACK_NAME}" --format '{{.Name}}' 2>/dev/null || true)
  fi

  if [ "${#seen[@]}" -eq 0 ]; then
    return 0
  fi
  printf '%s\n' "${!seen[@]}" | LC_ALL=C sort -u
}

# Resolve short or full name → Swarm service.
# Sets: EIP_SVC_KIND EIP_SVC_SHORT EIP_SVC_FULL
eip_resolve_service() {
  local want="$1"
  local short full

  want="$(echo "${want}" | xargs)"
  [ -n "${want}" ] || return 1

  if [[ "${want}" == "${STACK_NAME}"_* ]]; then
    short="${want#"${STACK_NAME}"_}"
    full="${want}"
  else
    short="${want}"
    full="${STACK_NAME}_${want}"
  fi

  EIP_SVC_SHORT="${short}"
  if docker service inspect "${full}" >/dev/null 2>&1; then
    EIP_SVC_KIND=swarm
    EIP_SVC_FULL="${full}"
    return 0
  fi
  return 1
}

# Interactive select from running services + optional "all".
# Usage: eip_pick_service [--all]  → prints short name or "all" on stdout
eip_pick_service() {
  local with_all=0
  local opt
  for opt in "$@"; do
    case "${opt}" in
      --all) with_all=1 ;;
    esac
  done

  if [ ! -t 0 ]; then
    echo "Error: run this interactively, or set SERVICE=…" >&2
    return 1
  fi

  local -a names=()
  mapfile -t names < <(eip_list_running_services)
  if [ "${#names[@]}" -eq 0 ]; then
    echo "Error: nothing is running. Start the app with: make up" >&2
    return 1
  fi

  local -a options=("${names[@]}")
  if [ "${with_all}" -eq 1 ]; then
    options+=("all")
  fi
  options+=("cancel")

  echo "What do you want to work with?" >&2
  # Do not `local PS3` — bash select ignores a local PS3 in some versions.
  PS3="Enter a number: "
  local choice=""
  select choice in "${options[@]}"; do
    if [ -z "${choice}" ]; then
      echo "Please enter a number from the list." >&2
      continue
    fi
    if [ "${choice}" = "cancel" ]; then
      echo "Cancelled." >&2
      return 1
    fi
    printf '%s\n' "${choice}"
    return 0
  done
  return 1
}

# Confirm y/N (default no). Message on stderr; returns 0 if yes.
eip_confirm() {
  local msg="$1"
  local ans=""
  echo "" >&2
  echo "${msg}" >&2
  if [ ! -t 0 ]; then
    echo "Error: confirmation required — run interactively (or pass -y)" >&2
    return 1
  fi
  read -r -p "Continue? [y/N] " ans || true
  case "${ans}" in
    y|Y|yes|YES) return 0 ;;
    *)
      echo "Cancelled." >&2
      return 1
      ;;
  esac
}
