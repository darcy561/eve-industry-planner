# shellcheck shell=bash
# Resolve eip.config.yaml and run services/cmd/eipconfig (validate / sync-env / apply).

# shellcheck source=root.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/root.sh"

# Sets EIP_CONFIG_FILE and EIP_CONFIG_ABS.
# --allow-example: fall back to admintool templates example with a WARN (default).
# --require-yaml: only eip.config.yaml (no example fallback).
resolve_eip_config() {
  local allow_example=1
  local example_rel="admintool/internal/templates/eip.config.yaml"
  for arg in "$@"; do
    case "${arg}" in
      --allow-example) allow_example=1 ;;
      --require-yaml) allow_example=0 ;;
    esac
  done

  if [ -z "${EIP_CONFIG_FILE:-}" ]; then
    if [ -f "${EIP_ROOT}/eip.config.yaml" ] || [ -f eip.config.yaml ]; then
      EIP_CONFIG_FILE="eip.config.yaml"
    elif [ "${allow_example}" -eq 1 ] && [ -f "${EIP_ROOT}/${example_rel}" ]; then
      EIP_CONFIG_FILE="${example_rel}"
      echo "WARN: using ${EIP_CONFIG_FILE} — copy to eip.config.yaml to customize." >&2
    else
      echo "Error: no eip.config.yaml${allow_example:+ or ${example_rel}}" >&2
      return 1
    fi
  fi

  case "${EIP_CONFIG_FILE}" in
    /*|[A-Za-z]:/*|[A-Za-z]:\\*) EIP_CONFIG_ABS="${EIP_CONFIG_FILE}" ;;
    *) EIP_CONFIG_ABS="${EIP_ROOT}/${EIP_CONFIG_FILE}" ;;
  esac

  if [ ! -f "${EIP_CONFIG_ABS}" ]; then
    echo "Error: config not found: ${EIP_CONFIG_ABS}" >&2
    return 1
  fi
  export EIP_CONFIG_FILE EIP_CONFIG_ABS
}

# Native Windows `go` mishandles MSYS TMP=/tmp (work dir becomes the redirect target).
# Force a real Windows temp directory when running under Git Bash / MSYS.
eipconfig_go_env() {
  if [ -n "${MSYSTEM:-}" ] || [[ "${OSTYPE:-}" == msys* ]] || [[ "${OSTYPE:-}" == cygwin* ]]; then
    local wt="${LOCALAPPDATA:-}/Temp"
    if [ ! -d "${wt}" ]; then
      wt="${TEMP:-/tmp}"
    fi
    export TMP="${wt}" TEMP="${wt}" TMPDIR="${wt}"
    mkdir -p "${wt}" 2>/dev/null || true
  fi
}

# Absolute path for a repo-relative (or already-absolute) file under EIP_ROOT.
eip_stack_abs() {
  local file="$1"
  case "${file}" in
    /*|[A-Za-z]:/*|[A-Za-z]:\\*) printf '%s' "${file}" ;;
    *) printf '%s' "${EIP_ROOT}/${file}" ;;
  esac
}

# go run ./cmd/eipconfig … (no --config). Used for stack YAML queries.
# Usage: eipconfig_run_raw discover-config-sync --stack /abs/path
eipconfig_run_raw() {
  if ! command -v go >/dev/null 2>&1; then
    echo "Error: go is required (services/cmd/eipconfig)" >&2
    return 1
  fi
  if [ "$#" -lt 1 ]; then
    echo "Error: eipconfig_run_raw needs a subcommand" >&2
    return 1
  fi
  (
    eipconfig_go_env
    export EIP_ROOT
    cd "${EIP_ROOT}/services" && go run ./cmd/eipconfig "$@"
  )
}

# Run services/cmd/eipconfig <subcommand> [args…] with --config EIP_CONFIG_ABS.
# Caller must resolve_eip_config first.
# Usage: eipconfig_run validate
#        eipconfig_run apply --dry-run
#        eipconfig_run sync-env   # stdout = KEY=VALUE lines
eipconfig_run() {
  if [ -z "${EIP_CONFIG_ABS:-}" ]; then
    echo "Error: eipconfig_run before resolve_eip_config" >&2
    return 1
  fi
  local sub="${1:-}"
  if [ -z "${sub}" ]; then
    echo "Error: eipconfig_run needs a subcommand" >&2
    return 1
  fi
  shift
  eipconfig_run_raw "${sub}" --config "${EIP_CONFIG_ABS}" "$@"
}

# Write sync-env KEY=VALUE lines to OUT_FILE (CR-stripped). Uses resolve_eip_config --allow-example.
eip_write_sync_env() {
  local out="$1"
  if [ -z "${out}" ]; then
    echo "Error: eip_write_sync_env needs OUT_FILE" >&2
    return 1
  fi
  resolve_eip_config --allow-example || return 1
  eipconfig_run sync-env >"${out}" || return 1
  # Strip CR for Windows/Git Bash consumers.
  if command -v sed >/dev/null 2>&1; then
    sed -i.bak 's/\r$//' "${out}" 2>/dev/null || true
    rm -f "${out}.bak" 2>/dev/null || true
  fi
}

# Temp sync-env under EIP_ROOT (avoids MSYS /tmp + native Go clashes). Prints path; caller must rm.
eip_sync_env_temp() {
  local out
  out="$(mktemp "${EIP_ROOT}/.eip-sync.XXXXXX")"
  if ! eip_write_sync_env "${out}"; then
    rm -f "${out}"
    return 1
  fi
  printf '%s' "${out}"
}
