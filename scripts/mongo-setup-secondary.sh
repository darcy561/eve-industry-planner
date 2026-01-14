#!/bin/bash
# Don't use set -e - we want to handle errors gracefully
set -u  # Only fail on undefined variables

# Global variable to track background MongoDB process
MONGO_PID=""

# Cleanup function to ensure MongoDB is stopped on script exit
cleanup() {
    if [ -n "$MONGO_PID" ] && kill -0 "$MONGO_PID" 2>/dev/null; then
        echo "Cleaning up background MongoDB process (PID: $MONGO_PID)..."
        kill "$MONGO_PID" 2>/dev/null || true
        sleep 2
        if kill -0 "$MONGO_PID" 2>/dev/null; then
            kill -9 "$MONGO_PID" 2>/dev/null || true
        fi
        wait "$MONGO_PID" 2>/dev/null || true
    fi
}

# Set up signal handlers
trap cleanup EXIT INT TERM

# Helper function to check if timeout command is available
has_timeout() {
    command -v timeout >/dev/null 2>&1
}

# Helper function to run command with timeout (with fallback)
run_with_timeout() {
    local timeout_seconds=$1
    shift
    if has_timeout; then
        timeout "$timeout_seconds" "$@"
    else
        # Fallback: run without timeout (not ideal, but better than failing)
        echo "Warning: timeout command not available, running without timeout"
        "$@"
    fi
}

# Validate keyfile exists
if [ ! -f "/etc/mongo-keyfile" ]; then
    echo "ERROR: MongoDB keyfile not found at /etc/mongo-keyfile"
    echo "Please ensure the keyfile is mounted correctly in docker-compose.yml"
    exit 1
fi

# Copy keyfile to writable location and set correct permissions
# MongoDB requires keyfile to have permissions 600 or less
# Since the mounted file may be read-only, we copy it to /tmp and use that
KEYFILE_PATH="/tmp/mongo-keyfile"
if ! cp /etc/mongo-keyfile "$KEYFILE_PATH" 2>/dev/null; then
    echo "ERROR: Failed to copy keyfile to $KEYFILE_PATH"
    exit 1
fi
if ! chmod 600 "$KEYFILE_PATH" 2>/dev/null; then
    echo "ERROR: Failed to set keyfile permissions to 600"
    exit 1
fi
if [ ! -r "$KEYFILE_PATH" ]; then
    echo "ERROR: Keyfile at $KEYFILE_PATH is not readable"
    exit 1
fi
echo "Keyfile copied to $KEYFILE_PATH with correct permissions (600)"

# Check if setup has already been completed
# If admin users collection exists, setup has been done
if [ -f "/data/db/admin/system.users.metadata" ] || [ -f "/data/db/admin/system.users.wt" ]; then
    echo "MongoDB users already exist. Starting with auth enabled..."
    # Start MongoDB with auth first
    mongod --replSet rs0 --bind_ip_all --auth --keyFile "$KEYFILE_PATH" > /tmp/mongod.log 2>&1 &
    MONGO_PID=$!
    
    # Validate that the process actually started
    PROCESS_START_WAIT=0
    MAX_PROCESS_WAIT=5
    while [ $PROCESS_START_WAIT -lt $MAX_PROCESS_WAIT ]; do
      sleep 1
      PROCESS_START_WAIT=$((PROCESS_START_WAIT + 1))
      if kill -0 "$MONGO_PID" 2>/dev/null; then
        # Process exists, verify it's actually MongoDB and not a zombie
        if ps -p "$MONGO_PID" -o comm= 2>/dev/null | grep -q mongod; then
          echo "MongoDB process started and verified (PID: $MONGO_PID)"
          break
        fi
      fi
      if [ $PROCESS_START_WAIT -ge $MAX_PROCESS_WAIT ]; then
        echo "ERROR: MongoDB process failed to start or died immediately"
        echo "MongoDB startup logs:"
        cat /tmp/mongod.log 2>/dev/null || echo "No logs available"
        exit 1
      fi
    done
    
    # Wait for MongoDB to be ready (with timeout and validation)
    echo "Waiting for MongoDB to be ready..."
    TIMEOUT=60
    ELAPSED=0
    CONNECTED=false
    until [ "$CONNECTED" = "true" ]; do
      # Check if process is still running
      if ! kill -0 "$MONGO_PID" 2>/dev/null; then
        echo "ERROR: MongoDB process died unexpectedly"
        echo "MongoDB startup logs:"
        cat /tmp/mongod.log 2>/dev/null || echo "No logs available"
        exit 1
      fi
      
      # Try to ping MongoDB
      if run_with_timeout 5 mongosh --eval "db.adminCommand('ping')" > /dev/null 2>&1; then
        # Verify we get a proper response
        PING_RESULT=$(run_with_timeout 5 mongosh --quiet --eval "db.adminCommand('ping').ok" 2>&1)
        if [ "$PING_RESULT" = "1" ]; then
          CONNECTED=true
          break
        fi
      fi
      
      if [ $ELAPSED -ge $TIMEOUT ]; then
        echo "ERROR: MongoDB failed to become ready within $TIMEOUT seconds"
        echo "MongoDB process status:"
        ps aux | grep "[m]ongod" || echo "MongoDB process not found"
        echo "MongoDB startup logs:"
        tail -50 /tmp/mongod.log 2>/dev/null || echo "No logs available"
        exit 1
      fi
      sleep 1
      ELAPSED=$((ELAPSED + 1))
      if [ $((ELAPSED % 10)) -eq 0 ]; then
        echo "Still waiting for MongoDB to be ready... ($ELAPSED/$TIMEOUT seconds)"
      fi
    done
    echo "MongoDB is ready and accepting connections"
    
    # Authenticate and check replica set status
    echo "Checking replica set status..."
    # Wait a bit for replica set to stabilize
    STABILIZE_WAIT=0
    MAX_STABILIZE_WAIT=30
    while [ $STABILIZE_WAIT -lt $MAX_STABILIZE_WAIT ]; do
      sleep 1
      STABILIZE_WAIT=$((STABILIZE_WAIT + 1))
      # Check if we can connect and replica set is responding
      RS_STATUS_CHECK=$(run_with_timeout 5 mongosh --quiet --eval "try { rs.status().ok } catch(e) { 0 }" 2>&1)
      if [ "$RS_STATUS_CHECK" = "1" ]; then
        echo "Replica set stabilized after $STABILIZE_WAIT seconds"
        break
      fi
      if [ $((STABILIZE_WAIT % 5)) -eq 0 ]; then
        echo "Waiting for replica set to stabilize... ($STABILIZE_WAIT/$MAX_STABILIZE_WAIT seconds)"
      fi
    done
    
    # Check if we're part of replica set and if there's a primary
    HAS_PRIMARY=$(run_with_timeout 30 mongosh --quiet --eval "
    try {
      var status = rs.status();
      for (var i = 0; i < status.members.length; i++) {
        if (status.members[i].stateStr === 'PRIMARY') {
          print('HAS_PRIMARY');
          quit(0);
        }
      }
      print('NO_PRIMARY');
    } catch (e) {
      print('NO_PRIMARY');
    }
    " 2>&1)
    
    if [[ "$HAS_PRIMARY" == *"NO_PRIMARY"* ]]; then
      echo "Warning: No primary exists in replica set. Primary node should handle election."
      echo "This node will continue as secondary and wait for primary election."
    else
      echo "Primary node detected in replica set."
    fi
    
    # Stop the background process and exec the final command
    cleanup
    # Clear trap since we're about to exec (replacing this process)
    trap - EXIT INT TERM
    echo "Starting MongoDB secondary with authentication..."
    exec mongod --replSet rs0 --bind_ip_all --auth --keyFile "$KEYFILE_PATH"
    exit 0
fi

# Start MongoDB without authentication first
echo "Starting MongoDB secondary in background (noauth mode)..."
mongod --replSet rs0 --bind_ip_all --noauth > /tmp/mongod.log 2>&1 &
MONGO_PID=$!

# Validate that the process actually started
PROCESS_START_WAIT=0
MAX_PROCESS_WAIT=5
while [ $PROCESS_START_WAIT -lt $MAX_PROCESS_WAIT ]; do
  sleep 1
  PROCESS_START_WAIT=$((PROCESS_START_WAIT + 1))
  if kill -0 "$MONGO_PID" 2>/dev/null; then
    # Process exists, verify it's actually MongoDB and not a zombie
    if ps -p "$MONGO_PID" -o comm= 2>/dev/null | grep -q mongod; then
      echo "MongoDB process started and verified (PID: $MONGO_PID)"
      break
    fi
  fi
  if [ $PROCESS_START_WAIT -ge $MAX_PROCESS_WAIT ]; then
    echo "ERROR: MongoDB process failed to start or died immediately"
    echo "MongoDB startup logs:"
    cat /tmp/mongod.log 2>/dev/null || echo "No logs available"
    exit 1
  fi
done

# Wait for MongoDB to be ready (with timeout and validation)
echo "Waiting for MongoDB secondary to be ready..."
TIMEOUT=60
ELAPSED=0
CONNECTED=false
until [ "$CONNECTED" = "true" ]; do
  # Check if process is still running
  if ! kill -0 "$MONGO_PID" 2>/dev/null; then
    echo "ERROR: MongoDB process died unexpectedly"
    echo "MongoDB startup logs:"
    cat /tmp/mongod.log 2>/dev/null || echo "No logs available"
    exit 1
  fi
  
  # Try to ping MongoDB
  if run_with_timeout 5 mongosh --eval "db.adminCommand('ping')" > /dev/null 2>&1; then
    # Verify we get a proper response
    PING_RESULT=$(run_with_timeout 5 mongosh --quiet --eval "db.adminCommand('ping').ok" 2>&1)
    if [ "$PING_RESULT" = "1" ]; then
      CONNECTED=true
      break
    fi
  fi
  
  if [ $ELAPSED -ge $TIMEOUT ]; then
    echo "ERROR: MongoDB failed to become ready within $TIMEOUT seconds"
    echo "MongoDB process status:"
    ps aux | grep "[m]ongod" || echo "MongoDB process not found"
    echo "MongoDB startup logs:"
    tail -50 /tmp/mongod.log 2>/dev/null || echo "No logs available"
    exit 1
  fi
  sleep 1
  ELAPSED=$((ELAPSED + 1))
  if [ $((ELAPSED % 10)) -eq 0 ]; then
    echo "Still waiting for MongoDB to be ready... ($ELAPSED/$TIMEOUT seconds)"
  fi
done
echo "MongoDB secondary is ready and accepting connections"

# Wait for replica set to be initialized (primary will do this)
echo "Waiting for replica set initialization..."
# Wait longer for primary to initialize replica set and add this member
INIT_WAIT=0
MAX_INIT_WAIT=30
while [ $INIT_WAIT -lt $MAX_INIT_WAIT ]; do
  sleep 1
  INIT_WAIT=$((INIT_WAIT + 1))
  # Check if replica set is initialized by trying to get status
  RS_INIT_CHECK=$(run_with_timeout 5 mongosh --quiet --eval "try { rs.status().ok } catch(e) { 0 }" 2>&1)
  if [ "$RS_INIT_CHECK" = "1" ]; then
    echo "Replica set appears to be initialized after $INIT_WAIT seconds"
    break
  fi
  if [ $((INIT_WAIT % 5)) -eq 0 ]; then
    echo "Waiting for replica set initialization... ($INIT_WAIT/$MAX_INIT_WAIT seconds)"
  fi
done

# Check if we're part of the replica set
echo "Checking replica set status..."
IS_IN_REPLSET=$(run_with_timeout 30 mongosh --quiet --eval "
try {
  var status = rs.status();
  print('IN_REPLSET');
} catch (e) {
  print('NOT_IN_REPLSET');
}
" 2>&1)

if [[ "$IS_IN_REPLSET" == *"NOT_IN_REPLSET"* ]]; then
  echo "Not yet part of replica set. Waiting for primary to add this member..."
  # Wait up to 120 seconds to be added to replica set (longer timeout for secondary)
  for i in {1..60}; do
    # Check if MongoDB process is still running
    if ! kill -0 "$MONGO_PID" 2>/dev/null; then
      echo "ERROR: MongoDB process died while waiting to join replica set"
      exit 1
    fi
    
    sleep 2
    IS_IN_REPLSET=$(run_with_timeout 10 mongosh --quiet --eval "
    try {
      var status = rs.status();
      print('IN_REPLSET');
    } catch (e) {
      print('NOT_IN_REPLSET');
    }
    " 2>&1)
    
    if [[ "$IS_IN_REPLSET" == *"IN_REPLSET"* ]]; then
      echo "Now part of replica set!"
      break
    fi
    
    if [ $((i % 10)) -eq 0 ]; then
      echo "Still waiting to be added to replica set... ($((i*2))/120 seconds)"
    fi
  done
  
  # Final check
  if [[ "$IS_IN_REPLSET" == *"NOT_IN_REPLSET"* ]]; then
    echo "Warning: Still not part of replica set after waiting. Primary may need to add this member manually."
    echo "This is OK - the secondary will continue and the primary should add it when ready."
  fi
else
  echo "Already part of replica set"
fi

# Note: Users are replicated from primary, so we don't create them here
# Only the primary can create users in a replica set
echo "Users will be replicated from primary. Waiting for primary to be ready before switching to auth..."

# Wait for primary to be established and ready before switching to auth mode
# This ensures both nodes can communicate during initial setup
PRIMARY_READY_WAIT=0
MAX_PRIMARY_WAIT=120
PRIMARY_READY=false
while [ $PRIMARY_READY_WAIT -lt $MAX_PRIMARY_WAIT ]; do
  sleep 2
  PRIMARY_READY_WAIT=$((PRIMARY_READY_WAIT + 2))
  
  # Check if primary exists and is healthy
  PRIMARY_CHECK=$(run_with_timeout 10 mongosh --quiet --eval "
  try {
    var status = rs.status();
    for (var i = 0; i < status.members.length; i++) {
      var member = status.members[i];
      if (member.stateStr === 'PRIMARY' && member.health === 1) {
        print('PRIMARY_READY');
        quit(0);
      }
    }
    print('NO_PRIMARY');
  } catch (e) {
    print('NO_PRIMARY');
  }
  " 2>&1)
  
  if [[ "$PRIMARY_CHECK" == *"PRIMARY_READY"* ]]; then
    echo "Primary is ready. Proceeding to switch to authentication mode..."
    PRIMARY_READY=true
    break
  fi
  
  if [ $((PRIMARY_READY_WAIT % 20)) -eq 0 ]; then
    echo "Waiting for primary to be ready before switching to auth... ($PRIMARY_READY_WAIT/$MAX_PRIMARY_WAIT seconds)"
  fi
done

if [ "$PRIMARY_READY" != "true" ]; then
  echo "Warning: Primary not ready after $MAX_PRIMARY_WAIT seconds. Proceeding with auth switch anyway."
  echo "If this causes issues, restart both containers."
fi

# Stop MongoDB gracefully
echo "Stopping MongoDB secondary to restart with authentication..."
cleanup

# Clear trap since we're about to exec (replacing this process)
trap - EXIT INT TERM

# Start MongoDB with authentication
echo "Starting MongoDB secondary with authentication..."
echo "Final configuration: replSet=rs0, auth=enabled, keyFile=$KEYFILE_PATH"
exec mongod --replSet rs0 --bind_ip_all --auth --keyFile "$KEYFILE_PATH"
