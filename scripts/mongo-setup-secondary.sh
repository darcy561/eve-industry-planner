#!/bin/bash
# Don't use set -e - we want to handle errors gracefully
set -u  # Only fail on undefined variables

# Check if setup has already been completed
# If admin users collection exists, setup has been done
if [ -f "/data/db/admin/system.users.metadata" ] || [ -f "/data/db/admin/system.users.wt" ]; then
    echo "MongoDB users already exist. Starting with auth enabled..."
    exec mongod --replSet rs0 --bind_ip_all --auth --keyFile /etc/mongo-keyfile
    exit 0
fi

# Start MongoDB without authentication first
mongod --replSet rs0 --bind_ip_all --noauth &
MONGO_PID=$!

# Wait for MongoDB to be ready
echo "Waiting for MongoDB secondary to start..."
until mongosh --eval "db.adminCommand('ping')" > /dev/null 2>&1; do
  sleep 1
done
echo "MongoDB secondary started"

# Wait for replica set to be initialized (primary will do this)
echo "Waiting for replica set initialization..."
# Wait longer for primary to initialize replica set and add this member
sleep 20

# Check if we're part of the replica set
echo "Checking replica set status..."
IS_IN_REPLSET=$(mongosh --quiet --eval "
try {
  var status = rs.status();
  print('IN_REPLSET');
} catch (e) {
  print('NOT_IN_REPLSET');
}
" 2>&1)

if [[ "$IS_IN_REPLSET" == *"NOT_IN_REPLSET"* ]]; then
  echo "Not yet part of replica set. Waiting for primary to add this member..."
  # Wait up to 60 seconds to be added to replica set
  for i in {1..60}; do
    sleep 2
    IS_IN_REPLSET=$(mongosh --quiet --eval "
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
fi

# Note: Users are replicated from primary, so we don't create them here
# Only the primary can create users in a replica set
echo "Users will be replicated from primary. Proceeding to restart with authentication..."

# Stop MongoDB
echo "Stopping MongoDB secondary to restart with authentication..."
kill $MONGO_PID
wait $MONGO_PID

# Start MongoDB with authentication
echo "Starting MongoDB secondary with authentication..."
exec mongod --replSet rs0 --bind_ip_all --auth --keyFile /etc/mongo-keyfile

