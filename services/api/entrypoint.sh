#!/bin/bash
set -e

# Fix permissions for mounted volumes (run as root)
if [ -d /data ]; then
    chown -R appuser:appuser /data 2>/dev/null || true
fi

# Switch to appuser and execute the main application with process name for system monitors
exec su-exec appuser /app/api-service "$@"
