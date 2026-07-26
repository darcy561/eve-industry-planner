# shellcheck shell=bash
# Swarm docker secret sync (#3): curated .env keys → versioned secret objects +
# compose overlay (SWARM_SECRETS_FILE) mounting at /run/secrets/<KEY>.
# Go reads via shared/core/swarmsecret (env first, then file).

_EIP_SECRETS_LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=log.sh
source "${_EIP_SECRETS_LIB}/log.sh"
# shellcheck source=paths.sh
source "${_EIP_SECRETS_LIB}/paths.sh"
# shellcheck source=env.sh
source "${_EIP_SECRETS_LIB}/env.sh"
# shellcheck source=require.sh
source "${_EIP_SECRETS_LIB}/require.sh"
# shellcheck source=yaml-services.sh
source "${_EIP_SECRETS_LIB}/yaml-services.sh"
# shellcheck source=eip-config.sh
source "${_EIP_SECRETS_LIB}/eip-config.sh"

# Required for elastic consumers (must be non-empty in .env).
EIP_SECRET_KEYS_REQUIRED=(
  MONGO_USERNAME
  MONGO_PASSWORD
  REDIS_PASSWORD
  S3_ACCESS_KEY
  S3_SECRET_KEY
  EVE_CLIENT_SECRET
  REFRESH_TOKEN_AES_KEY
  AUTHZ_HMAC_KEY
)

# Attached only when set in .env.
EIP_SECRET_KEYS_OPTIONAL=(
  MONGO_USERNAME_API
  MONGO_PASSWORD_API
  REDIS_USERNAME_API
  REDIS_PASSWORD_API
  REFRESH_TOKEN_AES_LEGACY_KEYS
  FEEDBACK_DISCORD_WEBHOOK_URL
)

# Per-service attach lists from docker-stack.yml secrets: (SoT).
# Prints keys for service $1 (empty = no secrets, e.g. frontend).
eip_service_secret_keys() {
  local want="$1" svc key
  while IFS=$'\t' read -r svc key; do
    [ -n "${svc}" ] || continue
    [ "${svc}" = "${want}" ] || continue
    printf '%s\n' "${key}"
  done < <(eipconfig_run_raw discover-secret-attach --stack "$(eip_stack_abs "${APP_STACK_FILE}")")
}

# Remove top-level secrets: and per-service secrets: from an expanded stack file.
# Overlay supplies hashed external objects + filtered attach (optional keys).
eip_strip_stack_secrets() {
  local file="$1" tmp
  tmp="$(mktemp)"
  awk '
    /^secrets:[[:space:]]*$/ { skip_top = 1; next }
    skip_top && /^[A-Za-z0-9_-]+:/ { skip_top = 0 }
    skip_top && /^x-/ { skip_top = 0 }
    skip_top { next }
    /^  [A-Za-z0-9_-]+:[[:space:]]*$/ { in_svc = 1; skip_sec = 0 }
    in_svc && /^  secrets:[[:space:]]*$/ { skip_sec = 1; next }
    skip_sec && /^    [^[:space:]]/ { skip_sec = 0 }
    skip_sec && /^  [A-Za-z0-9_-]+:/ { skip_sec = 0 }
    skip_sec && /^[A-Za-z0-9_-]+:/ { skip_sec = 0; in_svc = 0 }
    skip_sec { next }
    { print }
  ' "${file}" >"${tmp}"
  mv "${tmp}" "${file}"
}

eip_secret_content_hash() {
  if command -v sha256sum >/dev/null 2>&1; then
    printf '%s' "$1" | sha256sum | awk '{ print substr($1, 1, 12) }'
  else
    printf '%s' "$1" | shasum -a 256 | awk '{ print substr($1, 1, 12) }'
  fi
}

eip_secret_object_name() {
  local key="$1" hash="$2"
  printf 'eip_%s_%s' "${key}" "${hash}"
}

# Ensure docker secret object exists for key=value. Prints object name on stdout.
eip_ensure_secret_object() {
  local key="$1" value="$2" dry="${3:-0}"
  local hash obj
  hash="$(eip_secret_content_hash "${value}")"
  obj="$(eip_secret_object_name "${key}" "${hash}")"
  if docker secret inspect "${obj}" >/dev/null 2>&1; then
    printf '%s' "${obj}"
    return 0
  fi
  if [ "${dry}" -eq 1 ]; then
    echo "dry-run: would create docker secret ${obj} (from ${key})" >&2
    printf '%s' "${obj}"
    return 0
  fi
  if ! printf '%s' "${value}" | docker secret create "${obj}" - >/dev/null; then
    echo "Error: failed to create docker secret ${obj}" >&2
    return 1
  fi
  echo "created docker secret ${obj}" >&2
  printf '%s' "${obj}"
}

# Drop older eip_<KEY>_* objects that are not keep (best-effort; in-use secrets fail rm).
# Prints one line per successful rm. Silent when nothing to remove.
eip_prune_old_secret_objects() {
  local key="$1" keep="$2"
  local name
  while IFS= read -r name; do
    [ -n "${name}" ] || continue
    [ "${name}" = "${keep}" ] && continue
    if docker secret rm "${name}" >/dev/null 2>&1; then
      echo "pruned superseded docker secret ${name}" >&2
    fi
  done < <(docker secret ls --format '{{.Name}}' 2>/dev/null | grep -E "^eip_${key}_" || true)
}

# After stack deploy, prune superseded objects referenced by SWARM_SECRETS_FILE.
# No banner — silent unless eip_prune_old_secret_objects removes something.
eip_prune_stale_swarm_secrets() {
  local key obj
  [ -f "${SWARM_SECRETS_FILE}" ] || return 0
  while IFS=$'\t' read -r key obj; do
    [ -n "${key}" ] && [ -n "${obj}" ] || continue
    eip_prune_old_secret_objects "${key}" "${obj}"
  done < <(awk '
    /^secrets:[[:space:]]*$/ { in_secrets = 1; next }
    /^services:[[:space:]]*$/ { exit }
    in_secrets && /^  [A-Za-z0-9_]+:[[:space:]]*$/ {
      key = $1
      sub(/:.*/, "", key)
      next
    }
    in_secrets && key != "" && /^    name:[[:space:]]*/ {
      print key "\t" $2
      key = ""
    }
  ' "${SWARM_SECRETS_FILE}")
}

# Write overlay from map file (lines: KEY<TAB>OBJECT).
# Service attach SoT: docker-stack.yml via discover-secret-attach.
eip_write_secrets_overlay() {
  local map_file="$1" out="$2"
  local key obj svc k attach_tmp prev="" secret_lines=""

  attach_tmp="$(mktemp)"
  eipconfig_run_raw discover-secret-attach --stack "$(eip_stack_abs "${APP_STACK_FILE}")" \
    | sort -t "$(printf '\t')" -k1,1 -k2,2 >"${attach_tmp}" || {
    rm -f "${attach_tmp}"
    return 1
  }

  {
    echo "# Generated by sync_swarm_secrets — do not edit."
    echo "# Attach lists from docker-stack.yml; docker object names are versioned."
    echo "secrets:"
    sort -t "$(printf '\t')" -k1,1 "${map_file}" | while IFS=$'\t' read -r key obj; do
      [ -n "${key}" ] || continue
      echo "  ${key}:"
      echo "    external: true"
      echo "    name: ${obj}"
    done
    echo "services:"
    prev=""
    secret_lines=""
    while IFS=$'\t' read -r svc k; do
      [ -n "${svc}" ] && [ -n "${k}" ] || continue
      obj="$(awk -F '\t' -v want="${k}" '$1 == want { print $2; exit }' "${map_file}")"
      [ -n "${obj}" ] || continue
      if [ "${svc}" != "${prev}" ]; then
        if [ -n "${prev}" ] && [ -n "${secret_lines}" ]; then
          echo "  ${prev}:"
          echo "    secrets:"
          printf '%s' "${secret_lines}"
        fi
        prev="${svc}"
        secret_lines=""
      fi
      secret_lines+="      - ${k}"$'\n'
    done < "${attach_tmp}"
    if [ -n "${prev}" ] && [ -n "${secret_lines}" ]; then
      echo "  ${prev}:"
      echo "    secrets:"
      printf '%s' "${secret_lines}"
    fi
  } >"${out}"
  rm -f "${attach_tmp}"
}

# Sync curated secrets from .env and write SWARM_SECRETS_FILE.
# Usage: sync_swarm_secrets [--dry-run]
# Callers that deploy should run eip_prune_stale_swarm_secrets after stack deploy.
sync_swarm_secrets() {
  local dry=0
  case "${1:-}" in
    --dry-run|-n) dry=1 ;;
  esac

  require_file "${ENV_FILE}" || return 1
  require_file "${APP_STACK_FILE}" "missing ${APP_STACK_FILE} (secret attach SoT)" || return 1

  local map_file key value obj missing=0 out
  map_file="$(mktemp)"

  for key in "${EIP_SECRET_KEYS_REQUIRED[@]}"; do
    value="$(read_env_key "${ENV_FILE}" "${key}")"
    if [ -z "${value}" ]; then
      echo "Error: required secret ${key} is empty in ${ENV_FILE}" >&2
      missing=1
      continue
    fi
    obj="$(eip_ensure_secret_object "${key}" "${value}" "${dry}")" || {
      rm -f "${map_file}"
      return 1
    }
    printf '%s\t%s\n' "${key}" "${obj}" >>"${map_file}"
  done
  if [ "${missing}" -ne 0 ]; then
    rm -f "${map_file}"
    return 1
  fi

  for key in "${EIP_SECRET_KEYS_OPTIONAL[@]}"; do
    value="$(read_env_key "${ENV_FILE}" "${key}")"
    [ -n "${value}" ] || continue
    obj="$(eip_ensure_secret_object "${key}" "${value}" "${dry}")" || {
      rm -f "${map_file}"
      return 1
    }
    printf '%s\t%s\n' "${key}" "${obj}" >>"${map_file}"
  done

  out="$(mktemp)"
  if ! eip_write_secrets_overlay "${map_file}" "${out}"; then
    rm -f "${map_file}" "${out}"
    return 1
  fi
  rm -f "${map_file}"

  if [ "${dry}" -eq 1 ]; then
    echo "dry-run: secrets overlay would be:"
    cat "${out}"
    rm -f "${out}"
  else
    mv "${out}" "${SWARM_SECRETS_FILE}"
    eip_vlog "wrote ${SWARM_SECRETS_FILE}"
  fi
}
