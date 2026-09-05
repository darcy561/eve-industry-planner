#!/usr/bin/env bash
# Run gated live tests inside the stack network.
#
#   ./scripts/testing/live-mongo.sh                       # shared/mongo
#   ./scripts/testing/live-mongo.sh ./core/commands       # another package
#   ./scripts/testing/live-mongo.sh ./shared/mongo Watchlist   # one test
#
# The Mongo URL carries replicaSet=, so the driver discards the seed host and
# connects to the name the set advertises (mongo:27017). That name resolves on
# the stack network and nowhere else, which is why these run in a container
# rather than on the host. Credentials come from the running stack's secrets, so
# nothing is written down here.
#
# Needs a running stack: eip up / eip dev.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PKG="${1:-./shared/mongo}"
RUN="${2:-Live}"
NETWORK="${EIP_TEST_NETWORK:-eip-core}"

cd "$ROOT/services"

core="$(docker ps -q -f name=eip_core | head -1)"
if [ -z "$core" ]; then
  echo "no running eip_core: start the stack with 'eip up' or 'eip dev'" >&2
  exit 1
fi

# MSYS_NO_PATHCONV stops Git Bash rewriting the container-side paths.
user="$(MSYS_NO_PATHCONV=1 docker exec "$core" cat //run/secrets/MONGO_USERNAME)"
pass="$(MSYS_NO_PATHCONV=1 docker exec "$core" cat //run/secrets/MONGO_PASSWORD)"

mkdir -p "$ROOT/.tmp"
bin="$ROOT/.tmp/live-$(echo "$PKG" | tr -c 'a-zA-Z0-9' '-').test"

echo "building $PKG for linux/amd64…"
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go test -c -o "$bin" "$PKG"

# pwd -W gives the Windows path docker needs for a bind mount; plain pwd elsewhere.
host_bin="$bin"
if command -v cygpath >/dev/null 2>&1; then
  host_bin="$(cygpath -w "$bin")"
fi

echo "running -test.run '$RUN' on network $NETWORK…"
MSYS_NO_PATHCONV=1 docker run --rm --network "$NETWORK" \
  -e EIP_MONGO_PARITY_LIVE=1 \
  -e MONGO_HOST=mongo -e MONGO_PORT=27017 \
  -e MONGO_USERNAME="$user" -e MONGO_PASSWORD="$pass" \
  -e NATS_URL="${NATS_URL:-nats://nats:4222}" \
  -e LOG_LEVEL="${LOG_LEVEL:-error}" \
  -v "$host_bin:/live.test:ro" \
  --entrypoint /live.test alpine:3.20 \
  -test.run "$RUN" "${@:3}"
