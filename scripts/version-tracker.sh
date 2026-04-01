#!/bin/bash
# Simple version tracking and update system
# Checks if files have been updated on GitHub and downloads only changed files

set -e

VERSION_FILE=".downloaded-versions.json"
BASE_URL="https://raw.githubusercontent.com/darcy561/eve-industry-planner/Public"
BRANCH="Public"

# Initialize version file if it doesn't exist
init_version_file() {
    if [ ! -f "$VERSION_FILE" ]; then
        echo "{}" > "$VERSION_FILE"
    fi
}

# Get the latest commit SHA from GitHub for a branch
get_latest_commit() {
    local branch="$1"
    local api_url="https://api.github.com/repos/darcy561/eve-industry-planner/commits/${branch}"
    
    if command -v curl >/dev/null 2>&1; then
        curl -s "$api_url" 2>/dev/null | grep -o '"sha":"[^"]*"' | head -1 | cut -d'"' -f4 || echo "unknown"
    elif command -v wget >/dev/null 2>&1; then
        wget -q -O - "$api_url" 2>/dev/null | grep -o '"sha":"[^"]*"' | head -1 | cut -d'"' -f4 || echo "unknown"
    else
        echo "unknown"
    fi
}

# Get file hash (local or remote)
get_file_hash() {
    local file_path="$1"
    local is_remote="${2:-false}"
    
    if [ "$is_remote" = "true" ]; then
        local temp_file=$(mktemp)
        local download_url="${BASE_URL}/${file_path}"
        
        if command -v curl >/dev/null 2>&1; then
            curl -s -L -f "$download_url" -o "$temp_file" 2>/dev/null || {
                rm -f "$temp_file"
                return 1
            }
        elif command -v wget >/dev/null 2>&1; then
            wget -q -O "$temp_file" "$download_url" 2>/dev/null || {
                rm -f "$temp_file"
                return 1
            }
        else
            return 1
        fi
        
        if command -v sha256sum >/dev/null 2>&1; then
            sha256sum "$temp_file" | cut -d' ' -f1
        elif command -v shasum >/dev/null 2>&1; then
            shasum -a 256 "$temp_file" | cut -d' ' -f1
        else
            rm -f "$temp_file"
            return 1
        fi
        
        rm -f "$temp_file"
    else
        if [ -f "$file_path" ]; then
            if command -v sha256sum >/dev/null 2>&1; then
                sha256sum "$file_path" | cut -d' ' -f1
            elif command -v shasum >/dev/null 2>&1; then
                shasum -a 256 "$file_path" | cut -d' ' -f1
            fi
        fi
    fi
}

# Record version information for a file
record_version() {
    local file_path="$1"
    local commit_sha="$2"
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    
    if command -v jq >/dev/null 2>&1; then
        jq --arg file "$file_path" \
           --arg sha "$commit_sha" \
           --arg time "$timestamp" \
           --arg branch "$BRANCH" \
           '. + {($file): {commit: $sha, branch: $branch, downloaded_at: $time}}' \
           "$VERSION_FILE" > "${VERSION_FILE}.tmp" && mv "${VERSION_FILE}.tmp" "$VERSION_FILE"
    fi
}

# Update files - check versions and download only if changed
update_files() {
    local RUN_DIR="$(pwd)"
    local SCRIPTS_DIR="$RUN_DIR/scripts"
    
    # Files to check/update
    declare -A FILES=(
        ["docker-compose.yml"]="$RUN_DIR/docker-compose.yml"
        ["scripts/download-setup-scripts.sh"]="$SCRIPTS_DIR/download-setup-scripts.sh"
        ["scripts/mongo-setup.sh"]="$SCRIPTS_DIR/mongo-setup.sh"
        ["scripts/generate-mongo-keyfile.sh"]="$SCRIPTS_DIR/generate-mongo-keyfile.sh"
    )
    
    init_version_file
    
    # Get latest commit
    local latest_commit=$(get_latest_commit "$BRANCH")
    if [ "$latest_commit" = "unknown" ]; then
        echo "Warning: Could not determine latest commit. Downloading all files anyway." >&2
    fi
    
    local updated_count=0
    local skipped_count=0
    
    # Check and update each file
    for RELATIVE_PATH in "${!FILES[@]}"; do
        local LOCAL_PATH="${FILES[$RELATIVE_PATH]}"
        local DOWNLOAD_URL="${BASE_URL}/${RELATIVE_PATH}"
        
        # Get hashes
        local local_hash=$(get_file_hash "$LOCAL_PATH" false)
        local remote_hash=$(get_file_hash "$RELATIVE_PATH" true)
        
        if [ -z "$remote_hash" ]; then
            echo "Error: Could not fetch ${RELATIVE_PATH} from GitHub" >&2
            continue
        fi
        
        # Compare hashes
        if [ "$local_hash" = "$remote_hash" ] && [ -n "$local_hash" ]; then
            echo "✓ ${RELATIVE_PATH} is up to date"
            skipped_count=$((skipped_count + 1))
        else
            echo "→ Updating ${RELATIVE_PATH}..."
            
            # Download file
            if command -v curl >/dev/null 2>&1; then
                if ! curl -L -f -o "$LOCAL_PATH" "$DOWNLOAD_URL"; then
                    echo "Error: Failed to download ${RELATIVE_PATH}" >&2
                    continue
                fi
            elif command -v wget >/dev/null 2>&1; then
                if ! wget -q -O "$LOCAL_PATH" "$DOWNLOAD_URL"; then
                    echo "Error: Failed to download ${RELATIVE_PATH}" >&2
                    continue
                fi
            else
                echo "Error: curl or wget required" >&2
                exit 1
            fi
            
            # Make scripts executable
            if [[ "$RELATIVE_PATH" == scripts/*.sh ]]; then
                chmod +x "$LOCAL_PATH"
            fi
            
            # Record version
            if [ "$latest_commit" != "unknown" ]; then
                record_version "$RELATIVE_PATH" "$latest_commit"
            fi
            
            updated_count=$((updated_count + 1))
        fi
    done
    
    echo ""
    if [ $updated_count -gt 0 ]; then
        echo "Updated ${updated_count} file(s), ${skipped_count} already up to date"
    else
        echo "All files are up to date"
    fi
}

# Main command handler
case "${1:-update}" in
    update)
        update_files
        ;;
    *)
        echo "Usage: $0 [update]"
        echo ""
        echo "Checks all tracked files and updates them if newer versions are available on GitHub."
        exit 1
        ;;
esac
