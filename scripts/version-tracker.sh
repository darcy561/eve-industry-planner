#!/bin/bash
# Compare local sync state to the latest commit on GitHub Public; if it changed,
# re-download the branch tarball and replace docker-compose.yml, scripts/, and observability/
# (observability/ is optional — if absent upstream, local observability/ is removed).

set -e

VERSION_FILE=".downloaded-versions.json"
BRANCH="Public"
REPO_TGZ_URL="https://codeload.github.com/darcy561/eve-industry-planner/tar.gz/${BRANCH}"
RUN_DIR="$(pwd)"

init_version_file() {
    if [ ! -f "$VERSION_FILE" ]; then
        echo "{}" > "$VERSION_FILE"
    fi
}

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

get_stored_sync_commit() {
    if [ -f "$VERSION_FILE" ] && command -v jq >/dev/null 2>&1; then
        jq -r '.sync_bundle.commit // empty' "$VERSION_FILE" 2>/dev/null || true
    else
        echo ""
    fi
}

required_bundle_files_missing() {
    [ ! -f "$RUN_DIR/docker-compose.yml" ] && return 0
    [ ! -f "$RUN_DIR/scripts/mongo-setup.sh" ] && return 0
    [ ! -f "$RUN_DIR/scripts/ensure-refresh-token-key.sh" ] && return 0
    return 1
}

apply_public_archive() {
    local commit_sha="$1"

    if ! command -v tar >/dev/null 2>&1; then
        echo "Error: tar is required" >&2
        return 1
    fi
    if ! command -v curl >/dev/null 2>&1 && ! command -v wget >/dev/null 2>&1; then
        echo "Error: curl or wget is required" >&2
        return 1
    fi

    local TMP
    TMP=$(mktemp -d)
    # shellcheck disable=SC2064
    trap 'rm -rf "$TMP"' EXIT

    local tgz="$TMP/repo.tgz"
    echo "→ Downloading ${BRANCH} branch archive from GitHub..."
    if command -v curl >/dev/null 2>&1; then
        curl -L -f -o "$tgz" "$REPO_TGZ_URL" || return 1
    else
        wget -q -O "$tgz" "$REPO_TGZ_URL" || return 1
    fi

    tar -xzf "$tgz" -C "$TMP"
    local ROOT
    ROOT=$(find "$TMP" -mindepth 1 -maxdepth 1 -type d | head -1)
    if [ -z "$ROOT" ] || [ ! -f "$ROOT/docker-compose.yml" ] || [ ! -d "$ROOT/scripts" ]; then
        echo "Error: unexpected archive layout (expected docker-compose.yml and scripts/)" >&2
        return 1
    fi

    mkdir -p "$RUN_DIR/scripts"
    cp -f "$ROOT/docker-compose.yml" "$RUN_DIR/"

    # observability/ may be missing from the tarball if upstream removed it or only empty dirs
    # remained (git does not store empty folders). Mirror upstream: delete local when absent.
    if [ -d "$ROOT/observability" ]; then
        if command -v rsync >/dev/null 2>&1; then
            mkdir -p "$RUN_DIR/observability"
            rsync -a --delete "$ROOT/observability/" "$RUN_DIR/observability/"
        else
            rm -rf "$RUN_DIR/observability"
            cp -a "$ROOT/observability" "$RUN_DIR/"
        fi
    else
        rm -rf "$RUN_DIR/observability"
        echo "Note: observability/ not in Public archive; removed local observability/." >&2
    fi

    if command -v rsync >/dev/null 2>&1; then
        rsync -a --delete "$ROOT/scripts/" "$RUN_DIR/scripts/"
    else
        mkdir -p "$RUN_DIR/scripts"
        shopt -s nullglob
        for f in "$ROOT/scripts"/*; do
            cp -f "$f" "$RUN_DIR/scripts/"
        done
        shopt -u nullglob
    fi
    shopt -s nullglob
    for f in "$RUN_DIR/scripts"/*.sh; do
        chmod +x "$f"
    done
    shopt -u nullglob

    if command -v jq >/dev/null 2>&1; then
        init_version_file
        local timestamp
        timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
        jq --arg sha "${commit_sha:-unknown}" \
           --arg time "$timestamp" \
           --arg branch "$BRANCH" \
           '. + {sync_bundle: {commit: $sha, branch: $branch, downloaded_at: $time}}' \
           "$VERSION_FILE" > "${VERSION_FILE}.tmp" && mv "${VERSION_FILE}.tmp" "$VERSION_FILE"
    fi

    echo "Synced docker-compose.yml, scripts/, and observability/ (if present) from Public branch."
}

update_files() {
    init_version_file

    local latest_commit
    latest_commit=$(get_latest_commit "$BRANCH")
    local stored
    stored=$(get_stored_sync_commit)

    if [ -n "$stored" ] && [ -n "$latest_commit" ] && [ "$latest_commit" != "unknown" ] && [ "$stored" = "$latest_commit" ]; then
        if required_bundle_files_missing; then
            echo "Tracked bundle file(s) missing locally; forcing re-sync..."
            apply_public_archive "$latest_commit"
            return 0
        fi
        echo "All files are up to date (Public @ ${latest_commit:0:8})"
        return 0
    fi

    if [ "$latest_commit" = "unknown" ]; then
        echo "Warning: Could not determine latest commit from GitHub API; syncing archive anyway." >&2
    else
        echo "Syncing from Public (commit ${latest_commit:0:8})..."
    fi

    apply_public_archive "$latest_commit"
}

case "${1:-update}" in
    update)
        update_files
        ;;
    *)
        echo "Usage: $0 [update]"
        echo ""
        echo "Re-syncs compose, scripts/, and observability/ when Public branch HEAD changes."
        exit 1
        ;;
esac
