# shellcheck shell=bash
# Stack/Compose YAML helpers — service names and image lines via eipconfig (yaml.v3).

# shellcheck source=paths.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/paths.sh"
# shellcheck source=eip-config.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/eip-config.sh"

# Service names under top-level `services:` in a compose/stack file.
yaml_top_level_services() {
  local file="$1" abs
  abs="$(eip_stack_abs "${file}")"
  if [ ! -f "${abs}" ]; then
    echo "Error: missing stack file ${file}" >&2
    return 1
  fi
  eipconfig_run_raw list-stack-services --stack "${abs}"
}

# First `image:` value under a named top-level service (raw YAML token).
yaml_service_image() {
  local file="$1" want="$2" abs
  abs="$(eip_stack_abs "${file}")"
  if [ ! -f "${abs}" ]; then
    echo "Error: missing stack file ${file}" >&2
    return 1
  fi
  eipconfig_run_raw stack-service-image --stack "${abs}" --service "${want}"
}
