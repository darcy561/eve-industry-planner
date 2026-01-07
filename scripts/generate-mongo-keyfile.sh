#!/bin/bash
# Generate MongoDB replica set key file
# This key file is required for MongoDB replica sets with authentication enabled

set -e  # Exit on error

KEYFILE_PATH="./mongo-keyfile"

if [ -f "$KEYFILE_PATH" ]; then
    echo "Key file already exists at $KEYFILE_PATH"
    echo "If you want to regenerate it, delete the existing file first."
    exit 0
fi

# Check if openssl is available
if ! command -v openssl &> /dev/null; then
    echo "Error: openssl is required to generate the MongoDB key file" >&2
    echo "Please install openssl and try again" >&2
    exit 1
fi

# Generate a random key file (MongoDB requires 6-1024 characters)
openssl rand -base64 756 > "$KEYFILE_PATH"

# Set proper permissions (read-only for owner)
chmod 600 "$KEYFILE_PATH"

echo "MongoDB key file generated successfully at $KEYFILE_PATH"
echo "This file is required for MongoDB replica set authentication."
echo "Make sure to keep this file secure and do not commit it to version control."

