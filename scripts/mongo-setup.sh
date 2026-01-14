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
# If admin users collection exists, we still need to update passwords if they changed
USERS_EXIST=false
if [ -f "/data/db/admin/system.users.metadata" ] || [ -f "/data/db/admin/system.users.wt" ]; then
    USERS_EXIST=true
    echo "MongoDB users already exist. Starting with auth enabled..."
    # If users exist, start MongoDB directly with auth - no need to reconfigure replica set
    # The replica set should already be configured and stable
    # Use exec to replace shell process, but first validate keyfile is readable
    echo "Validating MongoDB keyfile is readable..."
    if [ ! -r "$KEYFILE_PATH" ]; then
        echo "ERROR: MongoDB keyfile is not readable"
        exit 1
    fi
    # Clear trap since we're about to exec (replacing this process)
    trap - EXIT INT TERM
    exec mongod --replSet rs0 --bind_ip_all --auth --keyFile "$KEYFILE_PATH"
    exit 0
fi

# Start MongoDB without authentication first (needed to create/update users)
# Note: Cannot use --keyFile with --noauth (MongoDB restriction)
# Both nodes will start in noauth mode, then restart with auth + keyfile after setup
echo "Starting MongoDB in background (noauth mode)..."
mongod --replSet rs0 --bind_ip_all --noauth > /tmp/mongod.log 2>&1 &
MONGO_PID=$!

# Validate that the process actually started
# Wait a bit and check multiple times to ensure process is stable
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

# Initialize replica set if not already initialized, or fix config if needed
echo "Checking replica set configuration..."
INIT_RESULT=$(run_with_timeout 30 mongosh --quiet --eval "
try {
  var config = rs.conf();
  if (config && config._id === 'rs0') {
    print('INITIALIZED');
  } else {
    print('NOT_INITIALIZED');
  }
} catch (e) {
  print('NOT_INITIALIZED');
}
" 2>&1)

if [[ "$INIT_RESULT" == *"NOT_INITIALIZED"* ]]; then
  echo "Initializing replica set with single member first..."
  # Initialize with just this member first - secondary will be added later
  # Set priority to 2 to ensure this node becomes primary
  INIT_OUTPUT=$(run_with_timeout 30 mongosh --eval "
  try {
    rs.initiate({
      _id: 'rs0',
      members: [
        { _id: 0, host: 'mongo:27017', priority: 2 }
      ]
    });
    print('SUCCESS');
  } catch (e) {
    print('ERROR: ' + e.message);
  }
  " 2>&1)
  
  if [[ "$INIT_OUTPUT" != *"SUCCESS"* ]]; then
    # Check if it failed because replica set is already initialized (race condition)
    if [[ "$INIT_OUTPUT" == *"already initialized"* ]] || [[ "$INIT_OUTPUT" == *"already been initiated"* ]]; then
      echo "Replica set was already initialized (likely by concurrent process)"
    else
      echo "Warning: Replica set initialization may have failed"
      echo "Output: $INIT_OUTPUT"
      # Don't exit - continue and try to work with existing state
    fi
  else
    echo "Replica set initialized with primary member"
  fi
  
  # Wait for this member to become primary (with validation)
  echo "Waiting to become primary..."
  PRIMARY_WAIT=0
  MAX_PRIMARY_WAIT=30
  while [ $PRIMARY_WAIT -lt $MAX_PRIMARY_WAIT ]; do
    sleep 1
    PRIMARY_WAIT=$((PRIMARY_WAIT + 1))
    IS_PRIMARY_CHECK=$(run_with_timeout 5 mongosh --quiet --eval "try { rs.isMaster().ismaster } catch(e) { 'false' }" 2>&1)
    if [ "$IS_PRIMARY_CHECK" = "true" ]; then
      echo "Became primary after $PRIMARY_WAIT seconds"
      break
    fi
    if [ $((PRIMARY_WAIT % 5)) -eq 0 ]; then
      echo "Still waiting to become primary... ($PRIMARY_WAIT/$MAX_PRIMARY_WAIT seconds)"
    fi
  done
  
  # Now try to add secondary if it's reachable
  echo "Attempting to add secondary member..."
  ADD_SECONDARY_OUTPUT=$(run_with_timeout 30 mongosh --eval "
  try {
    rs.add({ _id: 1, host: 'mongo-secondary:27017', priority: 1 });
    print('SUCCESS');
  } catch (e) {
    print('SKIPPED: ' + e.message);
  }
  " 2>&1)
  
  if [[ "$ADD_SECONDARY_OUTPUT" == *"SUCCESS"* ]]; then
    echo "Secondary member added successfully"
  else
    echo "Could not add secondary yet (this is OK if secondary is not ready)"
  fi
else
  echo "Replica set already initialized, checking configuration..."
  # Check and fix replica set configuration if needed
  RECONFIG_OUTPUT=$(run_with_timeout 60 mongosh --eval "
  try {
    var config = rs.conf();
    var status = rs.status();
    var currentHost = 'mongo:27017';
    var secondaryHost = 'mongo-secondary:27017';
    var needsFix = false;
    var fixedConfig = JSON.parse(JSON.stringify(config));
    
    // Check if current member (mongo:27017) is in config
    var hasCurrentMember = false;
    var currentMemberId = -1;
    for (var i = 0; i < config.members.length; i++) {
      if (config.members[i].host === currentHost) {
        hasCurrentMember = true;
        currentMemberId = config.members[i]._id;
        break;
      }
    }
    
    // If current member not in config, add it
    if (!hasCurrentMember) {
      print('Current member not in replica set config, adding...');
      var newId = config.members.length > 0 ? Math.max(...config.members.map(m => m._id)) + 1 : 0;
      fixedConfig.members.push({ _id: newId, host: currentHost });
      needsFix = true;
    }
    
    // Check for unreachable members and remove them (except current and expected secondary)
    var membersToKeep = [];
    for (var i = 0; i < fixedConfig.members.length; i++) {
      var member = fixedConfig.members[i];
      var isReachable = false;
      
      // Check if member is reachable in status
      if (status && status.members) {
        for (var j = 0; j < status.members.length; j++) {
          if (status.members[j].name === member.host && status.members[j].health === 1) {
            isReachable = true;
            break;
          }
        }
      }
      
      // Keep member if it's current host, expected secondary, or reachable
      if (member.host === currentHost || member.host === secondaryHost || isReachable) {
        membersToKeep.push(member);
      } else {
        print('Removing unreachable member: ' + member.host);
        needsFix = true;
      }
    }
    
    // Ensure we have at least the current member
    if (membersToKeep.length === 0) {
      membersToKeep.push({ _id: 0, host: currentHost, priority: 2 });
      needsFix = true;
    }
    
    // Set priorities: mongo:27017 should have priority 2, mongo-secondary:27017 should have priority 1
    // Also fix BSON types that might be objects (like secondaryDelaySecs, protocolVersion)
    for (var i = 0; i < membersToKeep.length; i++) {
      if (membersToKeep[i].host === currentHost) {
        membersToKeep[i].priority = 2;
        needsFix = true;
      } else if (membersToKeep[i].host === secondaryHost) {
        membersToKeep[i].priority = 1;
        needsFix = true;
      } else if (!membersToKeep[i].hasOwnProperty('priority')) {
        // Set default priority for any other members
        membersToKeep[i].priority = 1;
        needsFix = true;
      }
      // Fix BSON Long types that get serialized as objects
      if (membersToKeep[i].secondaryDelaySecs && typeof membersToKeep[i].secondaryDelaySecs === 'object') {
        membersToKeep[i].secondaryDelaySecs = Number(membersToKeep[i].secondaryDelaySecs.low || 0);
        needsFix = true;
      }
      if (membersToKeep[i].votes && typeof membersToKeep[i].votes === 'object') {
        membersToKeep[i].votes = Number(membersToKeep[i].votes.low || 1);
        needsFix = true;
      }
    }
    
    // Fix protocolVersion if it's an object (common BSON type issue)
    if (fixedConfig.protocolVersion && typeof fixedConfig.protocolVersion === 'object') {
      fixedConfig.protocolVersion = Number(fixedConfig.protocolVersion.low || 1);
      needsFix = true;
    } else if (!fixedConfig.hasOwnProperty('protocolVersion')) {
      // Ensure protocolVersion is set (default is 1)
      fixedConfig.protocolVersion = 1;
      needsFix = true;
    }
    
    // Fix replicaSetId if it's a string (should be ObjectId or removed)
    // Initialize settings if it doesn't exist
    if (!fixedConfig.settings) {
      fixedConfig.settings = {};
    }
    if (fixedConfig.settings.replicaSetId) {
      if (typeof fixedConfig.settings.replicaSetId === 'string') {
        // Remove it - MongoDB will generate a new one automatically
        delete fixedConfig.settings.replicaSetId;
        needsFix = true;
        print('Removing invalid replicaSetId (string type, should be ObjectId)');
      } else if (typeof fixedConfig.settings.replicaSetId === 'object' && fixedConfig.settings.replicaSetId['\$oid']) {
        // Handle BSON ObjectId format - convert to proper ObjectId
        try {
          fixedConfig.settings.replicaSetId = ObjectId(fixedConfig.settings.replicaSetId['\$oid']);
          needsFix = true;
        } catch (e) {
          // If conversion fails, just remove it
          delete fixedConfig.settings.replicaSetId;
          needsFix = true;
        }
      }
    }
    
    fixedConfig.members = membersToKeep;
    fixedConfig.version = config.version + 1;
    
    // Ensure settings object exists if we're modifying it
    if (!fixedConfig.settings) {
      fixedConfig.settings = {};
    }
    
    // Apply fix if needed
    if (needsFix) {
      print('Fixing replica set configuration...');
      try {
        // Check if we're primary
        var isPrimary = false;
        try {
          isPrimary = rs.isMaster().ismaster;
        } catch (e) {
          // Not primary or can't check
        }
        
        // Try reconfig - use force if not primary
        if (isPrimary) {
          rs.reconfig(fixedConfig);
          print('Replica set configuration fixed successfully');
        } else {
          rs.reconfig(fixedConfig, { force: true });
          print('Replica set configuration fixed successfully (forced)');
        }
      } catch (reconfigErr) {
        print('Warning: Could not reconfigure replica set: ' + reconfigErr.message);
        // If reconfig fails due to BSON type issues, try removing problematic fields
        if (reconfigErr.message.indexOf('wrong type') !== -1 || reconfigErr.message.indexOf('replicaSetId') !== -1) {
          print('Attempting to fix BSON type issues by removing problematic fields...');
          try {
            // Remove settings.replicaSetId if it's causing issues
            if (fixedConfig.settings && fixedConfig.settings.replicaSetId) {
              delete fixedConfig.settings.replicaSetId;
              fixedConfig.version = config.version + 1;
              var isPrimary2 = false;
              try {
                isPrimary2 = rs.isMaster().ismaster;
              } catch (e) {}
              if (isPrimary2) {
                rs.reconfig(fixedConfig);
              } else {
                rs.reconfig(fixedConfig, { force: true });
              }
              print('Fixed by removing problematic replicaSetId field');
            }
          } catch (e2) {
            print('Could not fix BSON type issues: ' + e2.message);
            print('This is OK if replica set is still forming or if we are not primary');
          }
        } else {
          print('This is OK if replica set is still forming or if we are not primary');
        }
      }
    } else {
      print('Replica set configuration is valid');
    }
    
    // Try to add secondary if it's not in config and is reachable
    var hasSecondary = false;
    for (var i = 0; i < fixedConfig.members.length; i++) {
      if (fixedConfig.members[i].host === secondaryHost) {
        hasSecondary = true;
        break;
      }
    }
    
    if (!hasSecondary) {
      print('Attempting to add secondary member if reachable...');
      try {
        rs.add({ _id: 1, host: secondaryHost, priority: 1 });
        print('Secondary member added successfully');
      } catch (e) {
        print('Could not add secondary (this is OK if secondary is not ready): ' + e.message);
      }
    }
  } catch (e) {
    print('Error checking/fixing replica set config: ' + e.message);
    print('Continuing with existing configuration...');
  }
  " 2>&1)
  
  if [ -n "$RECONFIG_OUTPUT" ]; then
    echo "$RECONFIG_OUTPUT"
  fi
fi

# Wait a bit for replica set to stabilize and ensure we're primary
echo "Waiting for replica set to stabilize..."
# Use dynamic wait with validation instead of fixed sleep
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

# Check if we're primary before creating users
echo "Checking replica set status..."
IS_PRIMARY=$(run_with_timeout 30 mongosh --quiet --eval "try { rs.isMaster().ismaster } catch(e) { 'false' }" 2>&1)
  if [ "$IS_PRIMARY" != "true" ]; then
    echo "Warning: Not primary yet, checking if any primary exists..."
    # Check if there's any primary in the replica set
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
      echo "No primary exists in replica set. Attempting to force election..."
      # Try to force this node to become primary by temporarily freezing others
      # First, try to step up by reconfiguring with higher priority
      FORCE_ELECTION_OUTPUT=$(run_with_timeout 30 mongosh --quiet --eval "
      try {
        var config = rs.conf();
        var currentHost = 'mongo:27017';
        // Ensure this node has highest priority
        for (var i = 0; i < config.members.length; i++) {
          if (config.members[i].host === currentHost) {
            config.members[i].priority = 2;
          } else {
            config.members[i].priority = 1;
          }
        }
        config.version = config.version + 1;
        rs.reconfig(config, { force: true });
        print('SUCCESS');
      } catch (e) {
        print('FAILED: ' + e.message);
      }
      " 2>&1)
      
      if [[ "$FORCE_ELECTION_OUTPUT" != *"SUCCESS"* ]]; then
        echo "Warning: Could not force primary election"
      fi
      
      # Wait a bit for election (with validation)
      ELECTION_WAIT=0
      MAX_ELECTION_WAIT=15
      while [ $ELECTION_WAIT -lt $MAX_ELECTION_WAIT ]; do
        sleep 1
        ELECTION_WAIT=$((ELECTION_WAIT + 1))
        IS_PRIMARY_CHECK=$(run_with_timeout 5 mongosh --quiet --eval "try { rs.isMaster().ismaster } catch(e) { 'false' }" 2>&1)
        if [ "$IS_PRIMARY_CHECK" = "true" ]; then
          echo "Became primary after election attempt ($ELECTION_WAIT seconds)"
          break
        fi
      done
    fi
    
    echo "Waiting for primary status..."
      # Wait up to 60 seconds for primary status (longer to allow secondary to start)
      for i in {1..60}; do
        # Check if MongoDB process is still running
        if ! kill -0 "$MONGO_PID" 2>/dev/null; then
          echo "ERROR: MongoDB process died while waiting for primary status"
          exit 1
        fi
        sleep 1
        
        # Check primary status
        IS_PRIMARY=$(run_with_timeout 10 mongosh --quiet --eval "try { rs.isMaster().ismaster } catch(e) { 'false' }" 2>&1)
        if [ "$IS_PRIMARY" = "true" ]; then
          echo "Now primary, proceeding with user creation..."
          break
        fi
        
        # Check if we're stuck in RECOVERING state (can't become primary)
        if [ $((i % 5)) -eq 0 ]; then
          CURRENT_STATE=$(run_with_timeout 5 mongosh --quiet --eval "try { var status = rs.status(); var me = status.members.find(m => m.self); if (me) print(me.stateStr); else print('UNKNOWN'); } catch(e) { print('ERROR') }" 2>&1)
          if [ "$CURRENT_STATE" = "RECOVERING" ] && [ $i -ge 20 ]; then
            echo "Warning: Stuck in RECOVERING state for $i seconds. This may prevent primary election."
            echo "This often happens when secondary is unreachable. Will proceed with fallback after timeout."
          fi
        fi
        
        # Print progress every 10 seconds
        if [ $((i % 10)) -eq 0 ]; then
          echo "Still waiting for primary status... ($i/60 seconds)"
        fi
      done
  if [ "$IS_PRIMARY" != "true" ]; then
    echo "Error: Still not primary after waiting. Replica set may not be initialized yet."
    echo "This can happen if:"
    echo "  1. Replica set configuration has errors (BSON type issues)"
    echo "  2. Secondary node is not reachable or not authenticated"
    echo "  3. Replica set is still forming"
    echo ""
    echo "Attempting to check replica set state and proceed..."
    
    # Check if we can at least connect and see replica set status
    RS_STATE=$(run_with_timeout 10 mongosh --quiet --eval "
    try {
      var status = rs.status();
      print('STATE: ' + status.myState);
      print('MEMBERS: ' + status.members.length);
      for (var i = 0; i < status.members.length; i++) {
        print('  ' + status.members[i].name + ': ' + status.members[i].stateStr);
      }
    } catch (e) {
      print('ERROR: ' + e.message);
    }
    " 2>&1)
    
    echo "Replica set state:"
    echo "$RS_STATE"
    
    echo ""
    echo "Skipping user creation for now. Users will be created on next restart when primary is established."
    echo "Stopping MongoDB to restart with authentication..."
    cleanup
    # Clear trap since we're about to exec
    trap - EXIT INT TERM
    echo "Starting MongoDB with authentication..."
    exec mongod --replSet rs0 --bind_ip_all --auth --keyFile "$KEYFILE_PATH"
    exit 0
  fi
fi

# Create or update root user
echo "Creating or updating root user..."
ROOT_USER_OUTPUT=$(run_with_timeout 30 mongosh --eval "
db = db.getSiblingDB('admin');
var rootUsername = process.env.MONGO_ROOT_USERNAME || 'admin';
var rootPassword = process.env.MONGO_ROOT_PASSWORD || 'admin';

try {
  // Try to create user first
  db.createUser({
    user: rootUsername,
    pwd: rootPassword,
    roles: ['root']
  });
  print('SUCCESS: Root user created');
} catch (e) {
  if (e.code === 51003) {
    // User already exists, update password
    print('Root user already exists, updating password...');
    try {
      db.updateUser(rootUsername, {
        pwd: rootPassword,
        roles: ['root']
      });
      print('SUCCESS: Root user password updated successfully');
    } catch (updateErr) {
      print('ERROR: Error updating root user password: ' + updateErr);
      // Don't throw - continue with other users
    }
  } else {
    print('ERROR: Error creating root user: ' + e);
    // Don't throw - continue with other users
  }
}
" 2>&1)

if [[ "$ROOT_USER_OUTPUT" == *"SUCCESS"* ]]; then
  echo "Root user operation completed successfully"
elif [[ "$ROOT_USER_OUTPUT" == *"ERROR"* ]]; then
  echo "Warning: Failed to create/update root user, continuing..."
  echo "Details: $ROOT_USER_OUTPUT"
fi

# Create primary application user
echo "Creating primary application user..."
APP_USER_OUTPUT=$(run_with_timeout 30 mongosh --eval "
db = db.getSiblingDB('admin');
var mongoUsername = process.env.MONGO_USERNAME || 'appuser';
var mongoPassword = process.env.MONGO_PASSWORD || 'apppass';

// Create primary user
try {
  db.createUser({
    user: mongoUsername,
    pwd: mongoPassword,
    roles: [
      { role: 'readWrite', db: 'eve_industry_planner' }
    ]
  });
  print('SUCCESS: Created primary user: ' + mongoUsername);
} catch (e) {
  if (e.code === 51003) {
    print('Primary user already exists, updating password');
    try {
      db.updateUser(mongoUsername, {
        pwd: mongoPassword,
        roles: [
          { role: 'readWrite', db: 'eve_industry_planner' }
        ]
      });
      print('SUCCESS: Primary user password updated');
    } catch (updateErr) {
      print('ERROR: Error updating primary user: ' + updateErr);
    }
  } else {
    print('ERROR: Error creating primary user: ' + e);
    // Don't throw - continue
  }
}
" 2>&1)

if [[ "$APP_USER_OUTPUT" == *"SUCCESS"* ]]; then
  echo "Primary application user operation completed successfully"
elif [[ "$APP_USER_OUTPUT" == *"ERROR"* ]]; then
  echo "Warning: Failed to create/update primary user, continuing..."
  echo "Details: $APP_USER_OUTPUT"
fi

# Stop MongoDB gracefully
echo "Stopping MongoDB to restart with authentication..."
cleanup

# Clear trap since we're about to exec (replacing this process)
trap - EXIT INT TERM

# Start MongoDB with authentication
echo "Starting MongoDB with authentication..."
echo "Final configuration: replSet=rs0, auth=enabled, keyFile=$KEYFILE_PATH"
exec mongod --replSet rs0 --bind_ip_all --auth --keyFile "$KEYFILE_PATH"

