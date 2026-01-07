#!/bin/bash
# Download setup scripts from the GitHub Public branch
# This script downloads docker-compose.yml and MongoDB setup scripts from the repository

set -e

# Get the directory where script was run from
RUN_DIR="$(pwd)"
SCRIPTS_DIR="$RUN_DIR/scripts"

# Ensure scripts directory exists
mkdir -p "$SCRIPTS_DIR"

# Check if curl is available
if ! command -v curl &> /dev/null; then
    echo "Error: curl is required to download setup scripts" >&2
    echo "Please install curl and try again" >&2
    exit 1
fi

# Base URL for GitHub Public branch
BASE_URL="https://raw.githubusercontent.com/darcy561/eve-industry-planner/Public"

# Files to download
declare -A FILES=(
    ["docker-compose.yml"]="$RUN_DIR/docker-compose.yml"
    ["scripts/mongo-setup.sh"]="$SCRIPTS_DIR/mongo-setup.sh"
    ["scripts/mongo-setup-secondary.sh"]="$SCRIPTS_DIR/mongo-setup-secondary.sh"
    ["scripts/generate-mongo-keyfile.sh"]="$SCRIPTS_DIR/generate-mongo-keyfile.sh"
)

# Download each file
for RELATIVE_PATH in "${!FILES[@]}"; do
    LOCAL_PATH="${FILES[$RELATIVE_PATH]}"
    DOWNLOAD_URL="${BASE_URL}/${RELATIVE_PATH}"
    
    echo "Downloading ${RELATIVE_PATH} from GitHub..."
    
    if ! curl -L -f -o "$LOCAL_PATH" "$DOWNLOAD_URL"; then
        echo "Error: Failed to download ${RELATIVE_PATH} from GitHub" >&2
        echo "URL: $DOWNLOAD_URL" >&2
        exit 1
    fi
    
    # Make scripts executable
    if [[ "$RELATIVE_PATH" == scripts/*.sh ]]; then
        chmod +x "$LOCAL_PATH"
        echo "Made ${RELATIVE_PATH} executable"
    fi
    
    echo "${RELATIVE_PATH} downloaded successfully to $LOCAL_PATH"
done

echo ""
echo "All setup scripts downloaded successfully!"

