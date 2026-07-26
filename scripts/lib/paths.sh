# shellcheck shell=bash
# Shared path / name defaults for Swarm scripts.

# shellcheck source=root.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/root.sh"

STACK_NAME="${EIP_STACK_NAME:-eip}"
ENV_FILE="${EIP_ENV_FILE:-.env}"
SWARM_SECRETS_FILE="${EIP_SWARM_SECRETS_FILE:-.eip-swarm-secrets.yml}"
SWARM_CONFIGS_FILE="${EIP_SWARM_CONFIGS_FILE:-.eip-swarm-configs.yml}"
LOCAL_BUILD_ENV_FILE="${EIP_LOCAL_BUILD_ENV_FILE:-.eip-local-build.env}"
# Written by stack-deploy: "live" | "dev". Rematerialize paths must honor this.
STACK_MODE_FILE="${EIP_STACK_MODE_FILE:-.eip-stack-mode}"
APP_STACK_FILE="${EIP_APP_STACK_FILE:-docker-stack.yml}"
APP_STACK_DEV_FILE="${EIP_APP_STACK_DEV_FILE:-docker-stack.dev.yml}"
DATA_STACK_FILE="${EIP_DATA_STACK_FILE:-docker-stack.data.yml}"
OBS_STACK_FILE="${EIP_OBS_STACK_FILE:-docker-stack.obs.yml}"
NETWORK_NAME="${EIP_NETWORK_NAME:-eip-core}"
OBS_NETWORK_NAME="${EIP_OBS_NETWORK_NAME:-eip-obs}"
