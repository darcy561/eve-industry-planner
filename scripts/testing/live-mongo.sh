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

# The suite works in its own database and refuses to run in the stack's. The app
# user authenticates against the stack's database whatever database it then
# works in, so it needs rights granted on this one: readWrite to use it, and
# dbAdmin because enabling change-stream pre-images is a collMod.
#
# The root credentials are environment on the mongo service, not Docker secrets:
# only the shared app user is mounted under /run/secrets, and never on eip_core.
DATABASE="${MONGO_DATABASE:-eve_industry_planner_test}"
mongo_cid="$(docker ps -q -f name=eip_mongo | head -1)"
if [ -z "$mongo_cid" ]; then
  echo "no running eip_mongo: cannot grant $user rights on $DATABASE" >&2
  exit 1
fi
root_user="$(MSYS_NO_PATHCONV=1 docker exec "$mongo_cid" printenv MONGO_ROOT_USERNAME)"
root_pass="$(MSYS_NO_PATHCONV=1 docker exec "$mongo_cid" printenv MONGO_ROOT_PASSWORD)"
if [ -z "$root_user" ] || [ -z "$root_pass" ]; then
  echo "eip_mongo carries no root credentials: cannot grant $user rights on $DATABASE" >&2
  exit 1
fi

echo "granting $user readWrite + dbAdmin on $DATABASE…"
MSYS_NO_PATHCONV=1 docker exec "$mongo_cid" mongosh --quiet \
  -u "$root_user" -p "$root_pass" --authenticationDatabase admin --eval "
    const home = db.getSiblingDB('eve_industry_planner');
    const roles = home.getUser('$user').roles.filter(r => r.db !== '$DATABASE');
    roles.push({ role: 'readWrite', db: '$DATABASE' });
    roles.push({ role: 'dbAdmin', db: '$DATABASE' });
    home.updateUser('$user', { roles });
  "

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
  -e MONGO_DATABASE="$DATABASE" \
  -e MONGO_USERNAME="$user" -e MONGO_PASSWORD="$pass" \
  -e NATS_URL="${NATS_URL:-nats://nats:4222}" \
  -e LOG_LEVEL="${LOG_LEVEL:-error}" \
  -v "$host_bin:/live.test:ro" \
  --entrypoint /live.test alpine:3.20 \
  -test.run "$RUN" "${@:3}"
