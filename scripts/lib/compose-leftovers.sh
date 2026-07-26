# shellcheck shell=bash
# Remove Compose containers for services that now run on Swarm.
#
# Safe scope: only containers labeled com.docker.compose.project=<this project>.
# Does not touch other Compose projects, host containers, or Swarm tasks.
# `docker compose rm <svc>` cannot work once <svc> is gone from the YAML — orphans
# need either `up --remove-orphans` or label-filtered `docker rm`.

# shellcheck source=log.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/log.sh"

# Compose project name from docker-compose.yml top-level `name:`.
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-eve-industry-planner}"

# Former Compose services — now Swarm (data / app / obs fragments).
EIP_MIGRATED_COMPOSE_SERVICES=(
  api
  websocket
  worker
  core
  frontend
  traefik
  ws-router
  prometheus
  mongo
  redis
  nats
  seaweedfs
  loki
  grafana
  alloy
  alloy-docker-proxy
  asynqmon
  nats-exporter
  redis-exporter
  mongodb-exporter
  node_exporter
  node-exporter
)

# Stop+remove leftover Compose containers for migrated services. Idempotent.
eip_remove_migrated_compose_leftovers() {
  local project="${COMPOSE_PROJECT_NAME}"
  local svc id name removed=0
  for svc in "${EIP_MIGRATED_COMPOSE_SERVICES[@]}"; do
    while IFS= read -r id; do
      [ -n "${id}" ] || continue
      name="$(docker inspect -f '{{.Name}}' "${id}" 2>/dev/null | sed 's#^/##')"
      name="${name:-${id}}"
      if docker rm -f "${id}" >/dev/null 2>&1; then
        eip_log "Removed leftover Compose ${svc} (${name}) — runs on Swarm now"
        removed=1
      fi
    done < <(docker ps -aq \
      --filter "label=com.docker.compose.project=${project}" \
      --filter "label=com.docker.compose.service=${svc}" 2>/dev/null || true)
  done
  if [ "${removed}" -eq 0 ]; then
    eip_vlog "No leftover Compose app containers for project ${project}"
  fi
}
