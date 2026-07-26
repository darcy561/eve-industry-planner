# shellcheck shell=bash
# SeaweedFS helpers — no throwaway aws-cli containers.
# Buckets are created by weed mini via S3_BUCKET env (docker-stack.data.yml).
# Scripts wait/verify with docker exec into the running Swarm task.

_EIP_S3_LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=log.sh
source "${_EIP_S3_LIB}/log.sh"
# shellcheck source=env.sh
source "${_EIP_S3_LIB}/env.sh"
# shellcheck source=paths.sh
source "${_EIP_S3_LIB}/paths.sh"

# Sets S3_ACCESS_KEY / S3_SECRET_KEY (S3_* first, then legacy MINIO_*).
resolve_s3_creds() {
  S3_ACCESS_KEY="$(read_env_key "${ENV_FILE}" S3_ACCESS_KEY)"
  S3_SECRET_KEY="$(read_env_key "${ENV_FILE}" S3_SECRET_KEY)"
  if [ -z "${S3_ACCESS_KEY}" ]; then
    S3_ACCESS_KEY="$(read_env_key "${ENV_FILE}" MINIO_ROOT_USER)"
  fi
  if [ -z "${S3_SECRET_KEY}" ]; then
    S3_SECRET_KEY="$(read_env_key "${ENV_FILE}" MINIO_ROOT_PASSWORD)"
  fi
}

ensure_data_volumes() {
  docker volume create eve-industry-planner_seaweedfs_data >/dev/null 2>&1 || true
  docker volume create eve-industry-planner_prometheus_data >/dev/null 2>&1 || true
  docker volume create eve-industry-planner_mongo_data >/dev/null 2>&1 || true
  docker volume create eve-industry-planner_redis_data >/dev/null 2>&1 || true
  docker volume create eve-industry-planner_nats_data >/dev/null 2>&1 || true
}

ensure_obs_volumes() {
  docker volume create eve-industry-planner_loki_data >/dev/null 2>&1 || true
  docker volume create eve-industry-planner_grafana_data >/dev/null 2>&1 || true
  docker volume create eve-industry-planner_alloy_data >/dev/null 2>&1 || true
}

# Running container ID for stack service seaweedfs (empty if none).
eip_seaweedfs_container() {
  docker ps -q \
    --filter "label=com.docker.swarm.service.name=${STACK_NAME}_seaweedfs" \
    --filter "status=running" 2>/dev/null | head -n 1
}

# Run a weed shell command inside the seaweedfs task (stdin → weed shell).
eip_weed_shell() {
  local cid="$1"
  shift
  printf '%s\n' "$@" | docker exec -i "${cid}" weed shell 2>/dev/null
}

# Wait until seaweedfs task is up and weed shell responds.
wait_s3_live() {
  local tries="${1:-90}" i cid
  eip_vlog "Waiting for SeaweedFS task (${STACK_NAME}_seaweedfs)…"
  for i in $(seq 1 "${tries}"); do
    cid="$(eip_seaweedfs_container)"
    if [ -n "${cid}" ] && eip_weed_shell "${cid}" "s3.bucket.list" >/dev/null 2>&1; then
      eip_vlog "SeaweedFS is live."
      return 0
    fi
    sleep 2
  done
  echo "Error: SeaweedFS did not become live in time" >&2
  return 1
}

# True if bucket name appears in s3.bucket.list output.
eip_s3_bucket_exists() {
  local cid="$1" name="$2" out
  out="$(eip_weed_shell "${cid}" "s3.bucket.list" || true)"
  printf '%s\n' "${out}" | grep -qE "^[[:space:]]*${name}([[:space:]]|$)"
}

# Create bucket if missing (weed mini usually already did via S3_BUCKET env).
eip_s3_ensure_bucket() {
  local cid="$1" name="$2"
  if eip_s3_bucket_exists "${cid}" "${name}"; then
    eip_vlog "OK: bucket ${name} exists"
    return 0
  fi
  eip_log "Creating S3 bucket ${name}…"
  eip_weed_shell "${cid}" "s3.bucket.create -name ${name}" >/dev/null
  if ! eip_s3_bucket_exists "${cid}" "${name}"; then
    echo "Error: failed to create bucket ${name}" >&2
    return 1
  fi
}
