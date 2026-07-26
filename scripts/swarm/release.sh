#!/bin/bash
# make release / make:dev-release: cohort-pass app train wave.
#
# 1) Build/pull ALL train images first (Swarm bakeable roles from docker-stack.dev.yml)
# 2) Roll Swarm core (stop-first singleton) — data plane already running
# 3) Dual-warm elastic Swarm (incl. frontend): scale each role to 2R, roll until bake>=R NEW beside R OLD
# 4) Advertise Redis once (full NEW cohort exists before OLD tear-down)
# 5) Look-ahead cordon → advance remaining OLD → scale back to R
# 6) Orphan / cordon cleanup
#
# Does NOT bounce mongo/redis/nats. Does NOT make capacity swarm-sync.
# Does run apply_swarm_configs (hash-diff file configs; no-op when unchanged).
# See docs/swarm/APP_TRAIN.md
#
# Usage:
#   ./scripts/swarm/release.sh --local
#   ./scripts/swarm/release.sh --ghcr
#   ./scripts/swarm/release.sh --local --dry-run
#   SERVICES=api,websocket ./scripts/swarm/release.sh --local

set -euo pipefail

_EIP_LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")/../lib" && pwd)"
# shellcheck source=lib/root.sh
source "${_EIP_LIB}/root.sh"
# shellcheck source=lib/env.sh
source "${_EIP_LIB}/env.sh"
# shellcheck source=lib/images.sh
source "${_EIP_LIB}/images.sh"
# shellcheck source=lib/configs.sh
source "${_EIP_LIB}/configs.sh"
eip_cd_root

# Long delay stalls Swarm between replica replacements so we can advance one column at a time.
STALL_DELAY="${EIP_RELEASE_UPDATE_DELAY:-8760h}"
# Never use delay=0 to "advance" — Swarm races through every pending replica before we re-stall
# (dual-warm overshoot: websocket bake 1→4, wiping OLD). Short gap = one task, then we re-stall.
ADVANCE_GAP="${EIP_RELEASE_ADVANCE_GAP:-20s}"
# Dual-warm order (frontend first so SPA updates with the train). Core is stop-first separately.
WARM_ORDER=(frontend worker api websocket ws-router)
DEFAULT_TRAIN="$(dev_app_services | paste -sd, -)"

DRY_RUN=0
MODE=""
WITH_TRAEFIK=0

for arg in "$@"; do
  case "${arg}" in
    --dry-run|-n) DRY_RUN=1 ;;
    --local) MODE="local" ;;
    --ghcr) MODE="ghcr" ;;
    --with-traefik) WITH_TRAEFIK=1 ;;
    -h|--help)
      echo "Usage: $0 --local|--ghcr [--dry-run] [--with-traefik]"
      echo "  Cohort-pass release: build-all → core stop-first → dual-warm → advertise → drain → scale to R"
      exit 0
      ;;
  esac
done

if [ -z "${MODE}" ]; then
  echo "Error: pass --local or --ghcr" >&2
  exit 1
fi

SERVICES_CSV="${SERVICES:-${DEFAULT_TRAIN}}"
SERVICES_CSV="$(echo "${SERVICES_CSV}" | tr ',' ' ' | xargs | tr ' ' ',')"
IFS=',' read -r -a RAW_LIST <<< "${SERVICES_CSV}"

SELECTED=()
while IFS= read -r role; do
  [ -n "${role}" ] || continue
  for want in "${RAW_LIST[@]}"; do
    want="$(echo "${want}" | xargs)"
    if [ "${want}" = "${role}" ]; then
      SELECTED+=("${role}")
      break
    fi
  done
done < <(dev_app_services)
if [ "${#SELECTED[@]}" -eq 0 ]; then
  echo "Error: no train roles selected" >&2
  exit 1
fi

role_selected() {
  local r="$1" s
  for s in "${SELECTED[@]}"; do
    [ "${s}" = "${r}" ] && return 0
  done
  return 1
}

is_swarm() {
  is_dev_app_service "$1"
}

desired_replicas() {
  local name="${STACK_NAME}_$1"
  if ! docker service inspect "${name}" >/dev/null 2>&1; then
    echo 0
    return
  fi
  docker service inspect "${name}" --format '{{if .Spec.Mode.Replicated}}{{.Spec.Mode.Replicated.Replicas}}{{else}}1{{end}}' 2>/dev/null || echo 0
}

running_task_count() {
  local name="${STACK_NAME}_$1"
  docker service ps "${name}" --filter desired-state=running --format '{{.ID}}' 2>/dev/null | wc -l | tr -d ' \r'
}

scale_service() {
  local role="$1" n="$2" name="${STACK_NAME}_${role}"
  echo "  scale ${name}=${n}"
  if [ "${DRY_RUN}" -eq 1 ]; then
    return 0
  fi
  docker service scale --detach "${name}=${n}" >/dev/null || true
}

wait_running_at_least() {
  local role="$1" need="$2" tries="${3:-90}" i have
  local name="${STACK_NAME}_${role}"
  for i in $(seq 1 "${tries}"); do
    have="$(running_task_count "${role}")"
    if [ "${have}" -ge "${need}" ]; then
      echo "  gate: ${name} running=${have} (need ${need})"
      return 0
    fi
    sleep 2
  done
  echo "WARN: timed out waiting for ${name} running>=${need} (have $(running_task_count "${role}"))" >&2
  return 1
}

# Surge to 2R so a full NEW cohort can sit beside OLD before any OLD tear-down.
surge_dual() {
  local role="$1" r dual name="${STACK_NAME}_$1"
  r="${DESIRED[$role]:-0}"
  [ "${r}" -ge 1 ] || return 0
  dual=$((r * 2))
  echo "  dual-surge ${name}: ${r} -> ${dual} (keep OLD while warming NEW)"
  if [ "${DRY_RUN}" -eq 1 ]; then
    return 0
  fi
  scale_service "${role}" "${dual}"
  wait_running_at_least "${role}" "${dual}" || true
}

# Count running tasks whose container APP_VERSION matches target (best-effort).
count_bake() {
  local role="$1" want="$2" name="${STACK_NAME}_$1" n=0 id ver
  [ "$(desired_replicas "${role}")" -gt 0 ] || { echo 0; return; }
  while IFS= read -r id; do
    [ -n "${id}" ] || continue
    ver="$(docker inspect "${id}" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | grep -E '^APP_VERSION=' | head -1 | cut -d= -f2- || true)"
    if [ "${ver}" = "${want}" ]; then
      n=$((n + 1))
    fi
  done < <(docker ps -q --filter "label=com.docker.swarm.service.name=${name}" 2>/dev/null || true)
  echo "${n}"
}

list_ws_slots_by_bake() {
  # Prints slot ids (websocket-N) for running websocket tasks matching (= or !=) want.
  local mode="$1" want="$2" name="${STACK_NAME}_websocket" id ver slot
  while IFS= read -r id; do
    [ -n "${id}" ] || continue
    ver="$(docker inspect "${id}" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | grep -E '^APP_VERSION=' | head -1 | cut -d= -f2- || true)"
    slot="$(docker inspect "${id}" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | grep -E '^OTEL_SERVICE_INSTANCE_ID=' | head -1 | cut -d= -f2- || true)"
    if [ -z "${slot}" ] || [[ "${slot}" == *"{{"* ]]; then
      slot=""
    fi
    if [ -z "${slot}" ]; then
      # Fallback: Swarm task slot from name eip_websocket.N.…
      local cname
      cname="$(docker inspect "${id}" --format '{{.Name}}' 2>/dev/null | sed 's#^/##')"
      if [[ "${cname}" =~ eip_websocket\.([0-9]+)\. ]]; then
        slot="websocket-${BASH_REMATCH[1]}"
      fi
    fi
    [ -n "${slot}" ] || continue
    if [ "${mode}" = "eq" ] && [ "${ver}" = "${want}" ]; then
      echo "${slot}"
    elif [ "${mode}" = "ne" ] && [ "${ver}" != "${want}" ]; then
      echo "${slot}"
    fi
  done < <(docker ps -q --filter "label=com.docker.swarm.service.name=${name}" 2>/dev/null || true)
}

wait_bake_at_least() {
  local role="$1" want="$2" need="$3" tries="${4:-90}" i have
  for i in $(seq 1 "${tries}"); do
    have="$(count_bake "${role}" "${want}")"
    if [ "${have}" -ge "${need}" ]; then
      echo "  gate: ${role} bake=${want} count=${have} (need ${need})"
      return 0
    fi
    sleep 2
  done
  echo "ERROR: timed out waiting for ${role} bake=${want} >= ${need} (have $(count_bake "${role}" "${want}"))" >&2
  return 1
}

image_for() {
  local role="$1"
  if [ "${MODE}" = "local" ]; then
    require_local_build_env || exit 1
    dev_image "${role}"
  else
    ghcr_image "${role}" "${APP_VERSION}"
  fi
}

# Start/ensure rolling update stalled between tasks.
# Local bake tags change each rebuild — Swarm picks up the new image name without --force.
# Service ContainerSpec.Env APP_VERSION is whatever last stack-deploy wrote (often
# stale vs .env). Always upsert it so count_bake / gates see the target.
ensure_update_stalled() {
  local role="$1" img
  img="$(image_for "${role}")"
  local name="${STACK_NAME}_${role}"
  echo "  update ${name} -> ${img} APP_VERSION=${APP_VERSION} (parallelism=1 delay=${STALL_DELAY})"
  if [ "${DRY_RUN}" -eq 1 ]; then
    return 0
  fi
  docker service update --detach \
    --image "${img}" \
    --env-add "APP_VERSION=${APP_VERSION}" \
    --update-parallelism 1 \
    --update-order start-first \
    --update-delay "${STALL_DELAY}" \
    "${name}" >/dev/null
}

# Allow Swarm to replace exactly one more replica, then stall again.
# Critical: update-delay must stay >0 during the advance window. delay=0 lets Swarm
# chain every remaining task before this loop notices and re-applies STALL_DELAY.
advance_one_replica() {
  local role="$1" before after gained tries=90 i
  local name="${STACK_NAME}_${role}"
  before="$(count_bake "${role}" "${APP_VERSION}")"
  echo "  advance one replica: ${name} (bake was ${before}, gap=${ADVANCE_GAP})"
  if [ "${DRY_RUN}" -eq 1 ]; then
    return 0
  fi
  docker service update --detach --update-delay "${ADVANCE_GAP}" "${name}" >/dev/null || true
  for i in $(seq 1 "${tries}"); do
    after="$(count_bake "${role}" "${APP_VERSION}")"
    if [ "${after}" -gt "${before}" ]; then
      # Re-stall immediately so the next column cannot start after ADVANCE_GAP.
      docker service update --detach --update-delay "${STALL_DELAY}" "${name}" >/dev/null || true
      gained=$((after - before))
      echo "  advanced ${name}: bake ${before} -> ${after}"
      if [ "${gained}" -gt 1 ]; then
        echo "WARN: ${name} overshot +${gained} in one advance (wanted +1) — re-stalled; dual-warm may have lost OLD slots" >&2
      fi
      return 0
    fi
    sleep 1
  done
  docker service update --detach --update-delay "${STALL_DELAY}" "${name}" >/dev/null || true
  echo "WARN: ${name} did not gain a NEW bake task (config shrink / already converged?)" >&2
  return 0
}

cordon_slots() {
  local slot
  for slot in "$@"; do
    [ -n "${slot}" ] || continue
    echo "  look-ahead cordon ${slot}"
    if [ "${DRY_RUN}" -eq 1 ]; then
      continue
    fi
    ./scripts/ops/ws-placement-ops.sh cordon "${slot}" || echo "WARN: cordon ${slot} failed (continuing)" >&2
  done
}

uncordon_gone_slots() {
  # Wave finished: drop look-ahead cordons so NEW tasks are placeable again.
  local slot
  if [ "${DRY_RUN}" -eq 1 ]; then
    echo "  dry-run: clear wave cordons"
    return 0
  fi
  while IFS= read -r slot; do
    [ -n "${slot}" ] || continue
    echo "  uncordon ${slot} (wave complete)"
    ./scripts/ops/ws-placement-ops.sh uncordon "${slot}" || true
  done < <(./scripts/ops/ws-placement-ops.sh status 2>/dev/null \
    | awk '/^--- cordoned slots ---$/{p=1;next} /^---/{p=0} p && /^websocket-/{print $1}')
}

# Final converge: finish any remaining OLD replacements, then scale back to R.
# Never --force when bake already matches final R — that restarts stable NEW sockets.
finish_role_converge() {
  local role="$1" name="${STACK_NAME}_$1" img r dual have
  img="$(image_for "${role}")"
  r="${DESIRED[$role]:-0}"
  [ "${r}" -gt 0 ] || return 0
  dual=$((r * 2))
  have="$(count_bake "${role}" "${APP_VERSION}")"
  echo "  finish ${name}: bake ${have} (want dual=${dual} then scale ${r}) ${img}"
  if [ "${DRY_RUN}" -eq 1 ]; then
    return 0
  fi
  if [ "${have}" -lt "${dual}" ]; then
    # Unblock stall so remaining OLD columns become NEW without remaking existing NEW.
    docker service update --detach \
      --image "${img}" \
      --env-add "APP_VERSION=${APP_VERSION}" \
      --update-parallelism 1 \
      --update-order start-first \
      --update-delay 0s \
      "${name}" >/dev/null || true
    wait_bake_at_least "${role}" "${APP_VERSION}" "${dual}" || true
    have="$(count_bake "${role}" "${APP_VERSION}")"
    if [ "${have}" -lt "${dual}" ] && [ "${MODE}" = "local" ]; then
      echo "WARN: ${name} still bake ${have}/${dual} — last-resort --force (will bounce NEW too)" >&2
      docker service update --detach \
        --force \
        --image "${img}" \
        --env-add "APP_VERSION=${APP_VERSION}" \
        --update-parallelism 1 \
        --update-order start-first \
        --update-delay 0s \
        "${name}" >/dev/null || true
      wait_bake_at_least "${role}" "${APP_VERSION}" "${dual}" || true
    fi
  else
    docker service update --detach \
      --update-delay 0s \
      --env-add "APP_VERSION=${APP_VERSION}" \
      "${name}" >/dev/null || true
  fi
  # Shrink dual capacity back to steady R (tasks should already be NEW).
  scale_service "${role}" "${r}"
  wait_bake_at_least "${role}" "${APP_VERSION}" "${r}" || true
  reconcile_role "${role}"
}


reconcile_role() {
  local role="$1" snap live name="${STACK_NAME}_$1" target
  snap="${DESIRED[$role]:-0}"
  live="$(desired_replicas "${role}")"
  if [ "${snap}" -lt 1 ] && [ "${live}" -lt 1 ]; then
    return 0
  fi
  if [ "${live}" -lt "${snap}" ]; then
    target="${live}"
  else
    target="${snap}"
  fi
  # Prefer snapshot if live grew from surge mid-wave.
  if [ "${live}" -gt "${snap}" ] && [ "${snap}" -gt 0 ]; then
    target="${snap}"
  fi
  # No-op when already at target: a sync `docker service scale` still waits for
  # Swarm "converge", which never returns while update-delay=STALL_DELAY (8760h)
  # has a rolling update paused mid-cohort.
  if [ "${live}" -eq "${target}" ]; then
    echo "  reconcile ${name}: live=${live} snapshot=${snap} (already at target, skip scale)"
    return 0
  fi
  echo "  reconcile ${name}: live=${live} snapshot=${snap} -> ${target}"
  if [ "${DRY_RUN}" -eq 1 ]; then
    return 0
  fi
  if docker service inspect "${name}" >/dev/null 2>&1; then
    # --detach: do not block the wave on stalled rolling-update convergence.
    docker service scale --detach "${name}=${target}" >/dev/null || true
  fi
}

# --- main ---
echo "release wave mode=${MODE} dry_run=${DRY_RUN}"
APP_VERSION="$(resolve_app_version --required)"
echo "APP_VERSION=${APP_VERSION}"

echo ""
echo "=== Swarm file-config sync (eip.config.sync) ==="
if [ "${DRY_RUN}" -eq 1 ]; then
  apply_swarm_configs --dry-run
else
  apply_swarm_configs
fi

declare -A DESIRED=()
MAX_PASS=1
for role in api websocket worker ws-router; do
  role_selected "${role}" || continue
  d="$(desired_replicas "${role}")"
  DESIRED["${role}"]="${d}"
  echo "  snapshot ${role} replicas=${d}"
  if [ "${d}" -gt "${MAX_PASS}" ]; then
    MAX_PASS="${d}"
  fi
done
# Compose frontend + Swarm core (stop-first) count as 1 if selected
for role in core frontend; do
  role_selected "${role}" || continue
  DESIRED["${role}"]=1
done
echo "  maxPass=${MAX_PASS}"

# ----- Build / pull all first -----
echo ""
echo "=== phase: build/pull all train images ==="
BUILD_LIST=()
for role in "${SELECTED[@]}"; do
  BUILD_LIST+=("${role}")
done
if [ "${MODE}" = "local" ]; then
  if [ "${DRY_RUN}" -eq 1 ]; then
    echo "  dry-run: rebuild SERVICES=${BUILD_LIST[*]} --build-only --no-cache"
  else
    SERVICES="$(IFS=,; echo "${BUILD_LIST[*]}")" ./scripts/swarm/rebuild.sh --build-only --no-cache
  fi
else
  while IFS= read -r role; do
    [ -n "${role}" ] || continue
    role_selected "${role}" || continue
    img="$(ghcr_image "${role}" "${APP_VERSION}")"
    [ -n "${img}" ] || continue
    echo "  pull ${img}"
    if [ "${DRY_RUN}" -eq 0 ]; then
      docker pull "${img}" || true
    fi
  done < <(dev_app_services)
fi

if [ "${WITH_TRAEFIK}" -eq 1 ]; then
  echo "  Traefik out-of-band (optional)"
  if [ "${DRY_RUN}" -eq 0 ]; then
    docker service update --detach --image "$(traefik_image)" "${STACK_NAME}_traefik" >/dev/null || true
  fi
fi

# ----- Swarm core (stop-first) before elastic dual-warm -----
echo ""
echo "=== swarm core (before elastic dual-warm) ==="
if role_selected core; then
  name="${STACK_NAME}_core"
  if [ "${MODE}" = "local" ]; then
    require_local_build_env || exit 1
    img="$(dev_image core)"
  else
    img="$(ghcr_image core "${APP_VERSION}")"
  fi
  if [ "${DRY_RUN}" -eq 1 ]; then
    echo "  dry-run: service update ${name} -> ${img} (stop-first)"
  elif docker service inspect "${name}" >/dev/null 2>&1; then
    echo "  roll ${name} -> ${img} (stop-first)"
    docker service update --detach --image "${img}" --env-add "APP_VERSION=${APP_VERSION}" "${name}" >/dev/null || true
  else
    echo "  skip ${name} (not deployed — run stack-deploy first)"
  fi
fi

# ----- Dual-warm: 2R capacity, bake>=R NEW beside R OLD before advertise -----
echo ""
echo "=== dual-warm NEW Swarm cohort (2R beside OLD) ==="
for role in "${WARM_ORDER[@]}"; do
  role_selected "${role}" || continue
  [ "${DESIRED[$role]:-0}" -ge 1 ] || continue
  surge_dual "${role}"
done
for role in "${WARM_ORDER[@]}"; do
  role_selected "${role}" || continue
  [ "${DESIRED[$role]:-0}" -ge 1 ] || continue
  ensure_update_stalled "${role}"
done
for role in "${WARM_ORDER[@]}"; do
  role_selected "${role}" || continue
  r="${DESIRED[$role]:-0}"
  [ "${r}" -ge 1 ] || continue
  if [ "${DRY_RUN}" -eq 1 ]; then
    echo "  dry-run: wait ${role} bake>=${r} (full NEW cohort)"
    continue
  fi
  wait_bake_at_least "${role}" "${APP_VERSION}" 1
  have="$(count_bake "${role}" "${APP_VERSION}")"
  while [ "${have}" -lt "${r}" ]; do
    echo "  warm ${role}: bake ${have}/${r} — advance one NEW column"
    advance_one_replica "${role}"
    wait_bake_at_least "${role}" "${APP_VERSION}" $((have + 1)) || true
    have="$(count_bake "${role}" "${APP_VERSION}")"
    if [ "${have}" -gt "${r}" ]; then
      echo "WARN: ${role} dual-warm overshoot bake=${have} (wanted ${r} NEW beside ${r} OLD) — stop advancing" >&2
      break
    fi
  done
  if [ "${have}" -eq "${r}" ]; then
    echo "  warm ${role}: bake ${have}/${r} NEW ready beside OLD"
  else
    echo "  warm ${role}: bake ${have}/${r} (target ${r}; check OLD still present before advertise)"
  fi
done

# ----- Advertise once (before any OLD tear-down) -----
echo ""
echo "=== advertise (once) ==="
if [ "${DRY_RUN}" -eq 1 ]; then
  ./scripts/ops/advertise.sh --dry-run
else
  export EIP_ENV_FILE="${EIP_ENV_FILE:-${ROOT}/.env}"
  ./scripts/ops/advertise.sh
fi

# ----- Drain remaining OLD columns (bake R -> 2R), then final scale to R -----
for pass in $(seq 1 "${MAX_PASS}"); do
  echo ""
  echo "=== drain pass ${pass} / ${MAX_PASS} (OLD -> NEW on dual capacity) ==="

  if role_selected websocket; then
    mapfile -t OLD_SLOTS < <(list_ws_slots_by_bake ne "${APP_VERSION}" | sort -t- -k2 -n)
    if [ "${#OLD_SLOTS[@]}" -gt 0 ]; then
      victim="${OLD_SLOTS[$((${#OLD_SLOTS[@]} - 1))]}"
      echo "  look-ahead cordon for next OLD column: ${victim}"
      cordon_slots "${victim}"
    else
      echo "  look-ahead: no OLD websocket slots (skip)"
    fi
  fi

  for role in "${WARM_ORDER[@]}"; do
    role_selected "${role}" || continue
    r="${DESIRED[$role]:-0}"
    [ "${r}" -ge 1 ] || continue
    dual=$((r * 2))
    want=$((r + pass))
    if [ "${want}" -gt "${dual}" ]; then
      want="${dual}"
    fi
    have="$(count_bake "${role}" "${APP_VERSION}")"
    if [ "${DRY_RUN}" -eq 1 ]; then
      echo "  dry-run: advance ${role} to bake>=${want} (have ${have})"
      continue
    fi
    if [ "${have}" -ge "${want}" ]; then
      echo "  ${role} already bake>=${want} (${have})"
      continue
    fi
    advance_one_replica "${role}"
    wait_bake_at_least "${role}" "${APP_VERSION}" "${want}" || true
  done
done

# Final: finish remaining OLD replacements without bouncing already-NEW clients.
echo ""
echo "=== final converge + scale back to R ==="
for role in api websocket worker ws-router; do
  role_selected "${role}" || continue
  finish_role_converge "${role}"
done
uncordon_gone_slots

echo ""
echo "Release wave finished. Data plane untouched."
echo "Dual-warmed NEW cohort before advertise; drained OLD; scaled back to R."
echo "Docs: docs/swarm/APP_TRAIN.md"
