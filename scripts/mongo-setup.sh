#!/bin/bash
set -u

MONGO_PID=""
AUTH_PID=""
MONGO_HOST="${MONGO_HOST:-mongo}"
MONGO_PORT="${MONGO_PORT:-27017}"
MONGO_REPLICA_SET="${MONGO_REPLICA_SET:-rs0}"
KEYFILE_PATH="/tmp/mongo-keyfile"

cleanup() {
    if [ -n "${MONGO_PID}" ] && kill -0 "${MONGO_PID}" 2>/dev/null; then
        kill "${MONGO_PID}" 2>/dev/null || true
        wait "${MONGO_PID}" 2>/dev/null || true
    fi

    if [ -n "${AUTH_PID}" ] && kill -0 "${AUTH_PID}" 2>/dev/null; then
        kill "${AUTH_PID}" 2>/dev/null || true
        wait "${AUTH_PID}" 2>/dev/null || true
    fi
}
trap cleanup EXIT INT TERM

fail() {
    echo "ERROR: $1" >&2
    exit 1
}

run_mongosh() {
    mongosh --quiet "$@"
}

run_mongosh_root() {
    mongosh --quiet \
        -u "${MONGO_ROOT_USERNAME}" \
        -p "${MONGO_ROOT_PASSWORD}" \
        --authenticationDatabase admin \
        "$@"
}

wait_for_mongo() {
    # Mongo bootstrap can take longer on cold starts; keep this generous.
    local timeout_seconds=120
    local elapsed=0
    local have_root_creds="false"
    if [ -n "${MONGO_ROOT_USERNAME:-}" ] && [ -n "${MONGO_ROOT_PASSWORD:-}" ]; then
        have_root_creds="true"
    fi

    while [ "${elapsed}" -lt "${timeout_seconds}" ]; do
        if run_mongosh --eval "db.adminCommand('ping').ok" >/dev/null 2>&1; then
            return 0
        fi

        if [ "${have_root_creds}" = "true" ] && run_mongosh_root --eval "db.adminCommand('ping').ok" >/dev/null 2>&1; then
            return 0
        fi

        sleep 1
        elapsed=$((elapsed + 1))
    done

    fail "MongoDB failed to become ready within ${timeout_seconds}s"
}

ensure_replica_set() {
    if run_mongosh --eval "rs.status().ok" >/dev/null 2>&1 || run_mongosh_root --eval "rs.status().ok" >/dev/null 2>&1; then
        echo "Replica set already initialized"
    else
        echo "Initializing single-node replica set ${MONGO_REPLICA_SET}..."
        run_mongosh --eval "
            rs.initiate({
              _id: '${MONGO_REPLICA_SET}',
              members: [{ _id: 0, host: '${MONGO_HOST}:${MONGO_PORT}' }]
            })
        " >/dev/null 2>&1 || fail "Failed to initialize replica set"
    fi

    # Primary election / replica set init can take a bit; keep this generous.
    local timeout_seconds=60
    local elapsed=0
    while [ "${elapsed}" -lt "${timeout_seconds}" ]; do
        local is_primary
        is_primary=$(run_mongosh --eval "rs.isMaster().ismaster" 2>/dev/null || echo "false")

        if [ "${is_primary}" = "true" ]; then
            echo "Replica set initialized and PRIMARY is ready"
            return 0
        fi
        sleep 1
        elapsed=$((elapsed + 1))
    done

    fail "Replica set initialized but PRIMARY not ready within ${timeout_seconds}s"
}

ensure_users() {
    if [ -z "${MONGO_ROOT_USERNAME:-}" ] || [ -z "${MONGO_ROOT_PASSWORD:-}" ] || [ -z "${MONGO_USERNAME:-}" ] || [ -z "${MONGO_PASSWORD:-}" ]; then
        fail "MongoDB user credentials are required (MONGO_ROOT_USERNAME, MONGO_ROOT_PASSWORD, MONGO_USERNAME, MONGO_PASSWORD)"
    fi

    echo "Ensuring MongoDB users (root + application)..."

    # Use a single mongosh connection for all user writes.
    # Avoid embedding credentials directly in JS strings to prevent escaping issues.
    # MongoDB container environment variables are available to mongosh via `process.env`.
    local js="
      const rootUser = process.env.MONGO_ROOT_USERNAME;
      const rootPwd = process.env.MONGO_ROOT_PASSWORD;
      const appUser = process.env.MONGO_USERNAME;
      const appPwd = process.env.MONGO_PASSWORD;

      if (!rootUser || !rootPwd || !appUser || !appPwd) {
        throw new Error('Missing required Mongo env vars for user bootstrap');
      }

      const adminDb = db.getSiblingDB('admin');
      const appDb = db.getSiblingDB('eve_industry_planner');

      try {
        const rootExisting = adminDb.getUser(rootUser);
        if (rootExisting == null) {
          adminDb.createUser({
            user: rootUser,
            pwd: rootPwd,
            roles: [{ role: 'root', db: 'admin' }]
          });
        } else {
          adminDb.updateUser(rootUser, { pwd: rootPwd });
        }
      } catch (e) {
        throw new Error('ENSURE_ROOT_FAILED: ' + e);
      }

      try {
        const appExisting = appDb.getUser(appUser);
        if (appExisting == null) {
          appDb.createUser({
            user: appUser,
            pwd: appPwd,
            roles: [{ role: 'readWrite', db: 'eve_industry_planner' }]
          });
        } else {
          appDb.updateUser(appUser, { pwd: appPwd });
        }
      } catch (e) {
        throw new Error('ENSURE_APP_FAILED: ' + e);
      }

      // Verify.
      if (adminDb.getUser(rootUser) == null) {
        throw new Error('MISSING_ROOT_USER_AFTER_ENSURE');
      }
      if (appDb.getUser(appUser) == null) {
        throw new Error('MISSING_APP_USER_AFTER_ENSURE');
      }

      // Ensure user/role metadata is durably written.
      try {
        adminDb.adminCommand({ fsync: 1 });
      } catch (e) {
        throw new Error('FSYNC_FAILED: ' + e);
      }

      true;
    "
    local out=""
    if out="$(run_mongosh --eval "${js}" 2>&1)"; then
        :
    elif out="$(run_mongosh_root --eval "${js}" 2>&1)"; then
        :
    else
        echo "${out}" >&2
        fail "Failed to ensure/rotate MongoDB users"
    fi

    echo "MongoDB users verified."
}

if [ ! -f "/etc/mongo-keyfile" ]; then
    fail "MongoDB keyfile not found at /etc/mongo-keyfile"
fi

# MongoDB requires keyFile permissions <= 600
cp /etc/mongo-keyfile "${KEYFILE_PATH}" 2>/dev/null || fail "Failed to copy MongoDB keyfile"
chmod 600 "${KEYFILE_PATH}" 2>/dev/null || fail "Failed to set keyfile permissions"
if [ ! -r "${KEYFILE_PATH}" ]; then
    fail "MongoDB keyfile at ${KEYFILE_PATH} is not readable"
fi

echo "Starting MongoDB bootstrap instance (noauth)..."
mongod --replSet "${MONGO_REPLICA_SET}" --bind_ip_all --noauth > /tmp/mongod.log 2>&1 &
MONGO_PID=$!

wait_for_mongo
ensure_replica_set
ensure_users

echo "Shutting down noauth MongoDB for auth restart..."
# Graceful shutdown ensures user changes are persisted before auth restart.
run_mongosh --eval "db.adminCommand({ shutdown: 1 })" >/dev/null 2>&1 || true

while kill -0 "${MONGO_PID}" 2>/dev/null; do
  sleep 1
done

MONGO_PID=""

trap - EXIT INT TERM
echo "Starting MongoDB with auth enabled..."
mongod --replSet "${MONGO_REPLICA_SET}" --bind_ip_all --auth --keyFile "${KEYFILE_PATH}" > /tmp/mongod-auth.log 2>&1 &
AUTH_PID=$!

wait_for_mongo
ensure_replica_set
ensure_users

wait "${AUTH_PID}"
