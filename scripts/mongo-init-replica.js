// MongoDB replica set initialization script
try {
    var config = rs.conf();
    if (config && config._id === 'rs0') {
        print('Replica set already initialized');
    }
} catch (e) {
    print('Initializing replica set...');
    rs.initiate({
        _id: 'rs0',
        members: [
            { _id: 0, host: 'mongo:27017' },
            { _id: 1, host: 'mongo-secondary:27017' }
        ]
    });
    print('Replica set initialized successfully');
}

