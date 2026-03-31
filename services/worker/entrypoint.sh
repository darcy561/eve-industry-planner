#!/bin/bash
set -e

# Fix permissions for mounted volumes (run as root)
if [ -d /data ]; then
    chown -R appuser:appuser /data 2>/dev/null || true
fi

# Ensure SDE static data volume is writable by appuser
if [ ! -d /static-data ]; then
    mkdir -p /static-data 2>/dev/null || true
fi
if [ -d /static-data ]; then
    chown -R appuser:appuser /static-data 2>/dev/null || true
fi

# Switch to appuser and execute the main application with process name for system monitors
exec su-exec appuser /app/worker-service "$@"

