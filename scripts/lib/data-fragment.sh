# shellcheck shell=bash
# Data-layer Swarm fragment (docker-stack.data.yml) helpers.

# shellcheck source=yaml-services.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/yaml-services.sh"

# Service names under top-level `services:` in the data fragment.
data_layer_services() {
  yaml_top_level_services "${DATA_STACK_FILE}"
}

is_data_layer_service() {
  local want="$1" s
  while IFS= read -r s; do
    [ -z "${s}" ] && continue
    if [ "${s}" = "${want}" ]; then
      return 0
    fi
  done < <(data_layer_services)
  return 1
}
