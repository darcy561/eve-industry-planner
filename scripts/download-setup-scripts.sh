#!/bin/bash
# Download setup scripts from the GitHub Public branch
# This script downloads docker-compose.yml and MongoDB setup scripts only if they don't exist locally.
# Use 'make update-files' to update existing files.

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
BRANCH="Public"

# Get latest commit SHA for version tracking
get_latest_commit() {
    local api_url="https://api.github.com/repos/darcy561/eve-industry-planner/commits/${BRANCH}"
    if command -v curl >/dev/null 2>&1; then
        curl -s "$api_url" 2>/dev/null | grep -o '"sha":"[^"]*"' | head -1 | cut -d'"' -f4 || echo "unknown"
    elif command -v wget >/dev/null 2>&1; then
        wget -q -O - "$api_url" 2>/dev/null | grep -o '"sha":"[^"]*"' | head -1 | cut -d'"' -f4 || echo "unknown"
    else
        echo "unknown"
    fi
}

# Record version for a file
record_version() {
    local file_path="$1"
    local commit_sha="$2"
    local version_file="$RUN_DIR/.downloaded-versions.json"
    
    # Initialize version file if needed
    if [ ! -f "$version_file" ]; then
        echo "{}" > "$version_file"
    fi
    
    # Use jq if available for proper JSON handling
    if command -v jq >/dev/null 2>&1; then
        local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
        jq --arg file "$file_path" \
           --arg sha "$commit_sha" \
           --arg time "$timestamp" \
           --arg branch "$BRANCH" \
           '. + {($file): {commit: $sha, branch: $branch, downloaded_at: $time}}' \
           "$version_file" > "${version_file}.tmp" && mv "${version_file}.tmp" "$version_file"
    fi
}

# Files to download
declare -A FILES=(
    ["docker-compose.yml"]="$RUN_DIR/docker-compose.yml"
    ["scripts/mongo-setup.sh"]="$SCRIPTS_DIR/mongo-setup.sh"
    ["scripts/mongo-setup-secondary.sh"]="$SCRIPTS_DIR/mongo-setup-secondary.sh"
    ["scripts/generate-mongo-keyfile.sh"]="$SCRIPTS_DIR/generate-mongo-keyfile.sh"
    ["scripts/version-tracker.sh"]="$SCRIPTS_DIR/version-tracker.sh"
)

# Get latest commit SHA once
LATEST_COMMIT=$(get_latest_commit)
if [ "$LATEST_COMMIT" != "unknown" ]; then
    echo "Checking for missing files (commit: ${LATEST_COMMIT:0:8})..."
fi

# First, check if any files are missing
has_missing_files=false
for RELATIVE_PATH in "${!FILES[@]}"; do
    LOCAL_PATH="${FILES[$RELATIVE_PATH]}"
    if [ ! -f "$LOCAL_PATH" ]; then
        has_missing_files=true
        break
    fi
done

# If any files are missing, download ALL files to ensure consistency
if [ "$has_missing_files" = true ]; then
    echo "Some files are missing. Downloading all files to ensure consistency..."
    echo ""
    
    downloaded_count=0
    for RELATIVE_PATH in "${!FILES[@]}"; do
        LOCAL_PATH="${FILES[$RELATIVE_PATH]}"
        DOWNLOAD_URL="${BASE_URL}/${RELATIVE_PATH}"
        
        echo "→ Downloading ${RELATIVE_PATH} from GitHub..."
        
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
        
        # Record version information
        if [ "$LATEST_COMMIT" != "unknown" ]; then
            record_version "$RELATIVE_PATH" "$LATEST_COMMIT"
        fi
        
        echo "${RELATIVE_PATH} downloaded successfully to $LOCAL_PATH"
        downloaded_count=$((downloaded_count + 1))
    done
    
    echo ""
    echo "Downloaded ${downloaded_count} file(s) to ensure consistency"
else
    echo "All required files already exist (use 'make update-files' to update them)"
fi

