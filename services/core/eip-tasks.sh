#!/bin/sh
set -e

# Wrapper so you can run `eip-tasks <subcommand>` inside the container
# without needing `/app/core-service` on your PATH.
exec /app/core-service tasks "$@"

