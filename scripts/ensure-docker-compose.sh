#!/bin/bash
# Download docker-compose.yml from the GitHub Public branch
# This script replaces any existing docker-compose.yml file with the one from the repository

set -e

# Get the directory where script was run from
RUN_DIR="$(pwd)"
COMPOSE_FILE="$RUN_DIR/docker-compose.yml"

# Check if curl is available
if ! command -v curl &> /dev/null; then
    echo "Error: curl is required to download docker-compose.yml" >&2
    echo "Please install curl and try again" >&2
    exit 1
fi

# Download docker-compose.yml from GitHub Public branch
echo "Downloading docker-compose.yml from GitHub..."
COMPOSE_URL="https://raw.githubusercontent.com/darcy561/eve-industry-planner/Public/docker-compose.yml"

if ! curl -L -f -o "$COMPOSE_FILE" "$COMPOSE_URL"; then
    echo "Error: Failed to download docker-compose.yml from GitHub" >&2
    echo "URL: $COMPOSE_URL" >&2
    exit 1
fi

echo "docker-compose.yml downloaded successfully to $COMPOSE_FILE"

