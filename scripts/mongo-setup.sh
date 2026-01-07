#!/bin/bash
# Don't use set -e - we want to handle errors gracefully
set -u  # Only fail on undefined variables

# Check if setup has already been completed
# If admin users collection exists, we still need to update passwords if they changed
USERS_EXIST=false
if [ -f "/data/db/admin/system.users.metadata" ] || [ -f "/data/db/admin/system.users.wt" ]; then
    USERS_EXIST=true
    echo "MongoDB users already exist. Will update passwords if needed..."
fi

# Start MongoDB without authentication first (needed to create/update users)
mongod --replSet rs0 --bind_ip_all --noauth &
MONGO_PID=$!

# Wait for MongoDB to be ready
echo "Waiting for MongoDB to start..."
until mongosh --eval "db.adminCommand('ping')" > /dev/null 2>&1; do
  sleep 1
done
echo "MongoDB started"

# Initialize replica set if not already initialized, or fix config if needed
echo "Checking replica set configuration..."
INIT_RESULT=$(mongosh --quiet --eval "
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
  mongosh --eval "
  rs.initiate({
    _id: 'rs0',
    members: [
      { _id: 0, host: 'mongo:27017' }
    ]
  });
  print('Replica set initialized with primary member');
  " || echo "Warning: Replica set initialization may have failed"
  
  # Wait for this member to become primary
  echo "Waiting to become primary..."
  sleep 5
  
  # Now try to add secondary if it's reachable
  echo "Attempting to add secondary member..."
  mongosh --eval "
  try {
    rs.add({ _id: 1, host: 'mongo-secondary:27017' });
    print('Secondary member added successfully');
  } catch (e) {
    print('Could not add secondary yet (this is OK if secondary is not ready): ' + e.message);
  }
  " || echo "Warning: Could not add secondary member yet"
else
  echo "Replica set already initialized, checking configuration..."
  # Check and fix replica set configuration if needed
  mongosh --eval "
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
      membersToKeep.push({ _id: 0, host: currentHost });
      needsFix = true;
    }
    
    fixedConfig.members = membersToKeep;
    fixedConfig.version = config.version + 1;
    
    // Apply fix if needed
    if (needsFix) {
      print('Fixing replica set configuration...');
      try {
        rs.reconfig(fixedConfig, { force: true });
        print('Replica set configuration fixed successfully');
      } catch (reconfigErr) {
        print('Warning: Could not reconfigure replica set: ' + reconfigErr.message);
        print('This is OK if replica set is still forming or if we are not primary');
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
        rs.add({ _id: 1, host: secondaryHost });
        print('Secondary member added successfully');
      } catch (e) {
        print('Could not add secondary (this is OK if secondary is not ready): ' + e.message);
      }
    }
  } catch (e) {
    print('Error checking/fixing replica set config: ' + e.message);
    print('Continuing with existing configuration...');
  }
  " || echo "Warning: Could not check/fix replica set configuration"
fi

# Wait a bit for replica set to stabilize and ensure we're primary
echo "Waiting for replica set to stabilize..."
sleep 15

# Check if we're primary before creating users
echo "Checking replica set status..."
IS_PRIMARY=$(mongosh --quiet --eval "try { rs.isMaster().ismaster } catch(e) { 'false' }")
  if [ "$IS_PRIMARY" != "true" ]; then
    echo "Warning: Not primary yet, waiting..."
    # Wait up to 60 seconds for primary status (longer to allow secondary to start)
    for i in {1..60}; do
      sleep 1
      IS_PRIMARY=$(mongosh --quiet --eval "try { rs.isMaster().ismaster } catch(e) { 'false' }")
      if [ "$IS_PRIMARY" = "true" ]; then
        echo "Now primary, proceeding with user creation..."
        break
      fi
      # Print progress every 10 seconds
      if [ $((i % 10)) -eq 0 ]; then
        echo "Still waiting for primary status... ($i/60 seconds)"
      fi
    done
  if [ "$IS_PRIMARY" != "true" ]; then
    echo "Error: Still not primary after waiting. Replica set may not be initialized yet."
    echo "This is normal on first startup. Users will be created on next restart."
    # Don't exit - just skip user creation and restart with auth
    # Users will be created on the next run when replica set is ready
    echo "Stopping MongoDB to restart with authentication..."
    kill $MONGO_PID
    wait $MONGO_PID
    echo "Starting MongoDB with authentication..."
    exec mongod --replSet rs0 --bind_ip_all --auth --keyFile /etc/mongo-keyfile
    exit 0
  fi
fi

# Create or update root user
echo "Creating or updating root user..."
mongosh --eval "
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
  print('Root user created');
} catch (e) {
  if (e.code === 51003) {
    // User already exists, update password
    print('Root user already exists, updating password...');
    try {
      db.updateUser(rootUsername, {
        pwd: rootPassword,
        roles: ['root']
      });
      print('Root user password updated successfully');
    } catch (updateErr) {
      print('Error updating root user password: ' + updateErr);
      // Don't throw - continue with other users
    }
  } else {
    print('Error creating root user: ' + e);
    // Don't throw - continue with other users
  }
}
" || echo "Warning: Failed to create/update root user, continuing..."

# Create primary application user
echo "Creating primary application user..."
mongosh --eval "
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
  print('Created primary user: ' + mongoUsername);
} catch (e) {
  if (e.code === 51003) {
    print('Primary user already exists, updating password');
    db.updateUser(mongoUsername, {
      pwd: mongoPassword,
      roles: [
        { role: 'readWrite', db: 'eve_industry_planner' }
      ]
    });
  } else {
    print('Error creating primary user: ' + e);
    // Don't throw - continue
  }
}
" || echo "Warning: Failed to create primary user, continuing..."

# Stop MongoDB
echo "Stopping MongoDB to restart with authentication..."
kill $MONGO_PID
wait $MONGO_PID

# Start MongoDB with authentication
echo "Starting MongoDB with authentication..."
exec mongod --replSet rs0 --bind_ip_all --auth --keyFile /etc/mongo-keyfile

