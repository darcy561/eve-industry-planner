# shellcheck shell=bash
# Redis via docker exec for ops / smoke scripts.

# shellcheck source=env.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/env.sh"
# shellcheck source=require.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/require.sh"

eip_trim() {
  printf '%s' "$1" | tr -d '\r'
}

# Load REDIS_PASSWORD from ENV_FILE and resolve REDIS_C (container name).
# Call once after ENV_FILE is set; defines redis_cli / redis_raw.
eip_redis_setup() {
  require_file "${ENV_FILE}" "missing ${ENV_FILE} (need REDIS_PASSWORD)" || return 1

  REDIS_PASSWORD="$(read_env_key "${ENV_FILE}" REDIS_PASSWORD)"
  if [ -z "${REDIS_PASSWORD}" ]; then
    echo "Error: REDIS_PASSWORD missing in ${ENV_FILE}" >&2
    return 1
  fi

  REDIS_C="${EIP_REDIS_CONTAINER:-}"
  if [ -z "${REDIS_C}" ]; then
    REDIS_C="$(docker ps --format '{{.Names}}' | grep -E '(^|/)redisDB$|redisDB' | head -n1 || true)"
  fi
  if [ -z "${REDIS_C}" ]; then
    REDIS_C="$(docker ps --format '{{.Names}}' | grep -i redis | grep -vi exporter | head -n1 || true)"
  fi
  if [ -z "${REDIS_C}" ]; then
    echo "Error: could not find redis container (set EIP_REDIS_CONTAINER)" >&2
    return 1
  fi
}

redis_cli() {
  docker exec "${REDIS_C}" redis-cli -a "${REDIS_PASSWORD}" --no-auth-warning "$@"
}

redis_raw() {
  eip_trim "$(redis_cli --raw "$@")"
}
