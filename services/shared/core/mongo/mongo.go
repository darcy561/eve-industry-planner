package mongo

import (
	"context"
	"errors"
	"fmt"
	"time"

	"eve-industry-planner/shared/core/config"
	"eve-industry-planner/shared/shared/logs"

	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	"go.mongodb.org/mongo-driver/mongo/readpref"
)

// Database and collection names
var (
	// DatabaseName is the name of the MongoDB database
	DatabaseName = "eve_industry_planner"

	// CollectionUsers is the name of the users collection
	CollectionUsers = "users"

	// CollectionJobs is the name of the jobs collection
	CollectionJobs = "jobs"

	// CollectionGroups is the name of the groups collection
	CollectionGroups = "groups"
)

// connectMongo is a generic connection function that establishes a MongoDB client
// with the provided URL and connection options builder function
func connectMongo(mongoURL string, connectionName string, configureOpts func(*options.ClientOptions)) (*mongo.Client, error) {
	retryCount := 5
	retryDelay := 5 * time.Second

	for i := 0; i < retryCount; i++ {
		// Start with URI, then apply additional options
		opts := options.Client().ApplyURI(mongoURL)
		// Apply additional configuration
		configureOpts(opts)

		client, err := mongo.Connect(context.Background(), opts)
		if err == nil {
			// Verify connection by pinging
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			err = client.Ping(ctx, nil)
			cancel()

			if err == nil {
				i++
				message := fmt.Sprintf("Connected to %s on attempt %d/%d", connectionName, i, retryCount)
				logs.Debug(message)

				// Start background monitoring for connection health
				go monitorMongoConnection(client)

				return client, nil
			}
			// If ping failed, close client and retry
			_ = client.Disconnect(context.Background())
		}
		i++
		message := fmt.Sprintf("Failed to connect to %s. Attempt %d/%d. Error: %v", connectionName, i, retryCount, err)
		logs.Error(message)
		time.Sleep(retryDelay)
	}

	message := fmt.Sprintf("Failed to connect to %s after %d attempts. Exiting...", connectionName, retryCount)
	logs.Error(message)
	return nil, errors.New(message)
}

// ConnectPrimary establishes a client connection to the primary MongoDB instance
func ConnectPrimary() (*mongo.Client, error) {
	cfg, err := config.LoadConfig()
	if err != nil {
		return nil, err
	}

	// Configure MongoDB client with reconnection settings for primary
	configureOpts := func(opts *options.ClientOptions) {
		opts.SetConnectTimeout(10 * time.Second)
		opts.SetServerSelectionTimeout(10 * time.Second)
		opts.SetSocketTimeout(10 * time.Second)
		opts.SetHeartbeatInterval(10 * time.Second)
		opts.SetMaxPoolSize(10) // Match IncomingPoolSize (10 workers) to allow full concurrent DB operations
		opts.SetMinPoolSize(1)  // Minimal warm pool, scales automatically up to MaxPoolSize under load
		// Enable automatic reconnection
		opts.SetRetryWrites(true)
		opts.SetRetryReads(true)
	}

	return connectMongo(cfg.MONGO_URL, "Mongo", configureOpts)
}

// monitorMongoConnection periodically checks MongoDB connection health and logs reconnections
func monitorMongoConnection(client *mongo.Client) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		err := client.Ping(ctx, nil)
		cancel()

		if err != nil {
			logs.Warn("MongoDB connection health check failed, attempting reconnect", "error", err)
			// MongoDB driver will automatically reconnect on next operation
			// We just need to wait for it
			time.Sleep(2 * time.Second)
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			if err := client.Ping(ctx, nil); err == nil {
				logs.Info("MongoDB reconnected successfully")
			}
			cancel()
		}
	}
}

// ConnectSecondary connects to the MongoDB secondary instance for change streams
// Uses MONGO_SECONDARY_URL from config (credentials are validated in LoadConfig)
func ConnectSecondary() (*mongo.Client, error) {
	cfg, err := config.LoadConfig()
	if err != nil {
		return nil, err
	}

	// Configure MongoDB client with reconnection settings for secondary
	configureOpts := func(opts *options.ClientOptions) {
		opts.SetConnectTimeout(10 * time.Second)
		opts.SetServerSelectionTimeout(30 * time.Second) // Increased timeout for replica set stabilization
		opts.SetSocketTimeout(10 * time.Second)
		opts.SetHeartbeatInterval(10 * time.Second)
		opts.SetMaxPoolSize(10) // Lower pool size for read-only secondary
		opts.SetMinPoolSize(1)
		// Enable automatic reconnection
		opts.SetRetryWrites(false) // Secondaries don't accept writes
		opts.SetRetryReads(true)
		// Read preference for secondary - prefer secondary, fallback to primary
		opts.SetReadPreference(readpref.SecondaryPreferred())
	}

	client, err := connectMongo(cfg.MONGO_SECONDARY_URL, "Mongo Secondary", configureOpts)
	if err != nil {
		return nil, err
	}

	// Wait for replica set to be ready (has a PRIMARY) before returning
	// This prevents "No keys found for HMAC" errors during replica set initialization
	if err := waitForReplicaSetReady(client, 60*time.Second); err != nil {
		_ = client.Disconnect(context.Background())
		return nil, fmt.Errorf("replica set not ready: %w", err)
	}

	return client, nil
}

// waitForReplicaSetReady waits for the replica set to have a PRIMARY member
// This is necessary to avoid "No keys found for HMAC" errors during replica set initialization
func waitForReplicaSetReady(client *mongo.Client, timeout time.Duration) error {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	logs.Debug("Waiting for replica set to be ready (PRIMARY must exist)")

	for {
		select {
		case <-ctx.Done():
			return fmt.Errorf("timeout waiting for replica set to be ready: %w", ctx.Err())
		case <-ticker.C:
			// Try to ping with PRIMARY read preference - this will only succeed if PRIMARY exists
			pingCtx, pingCancel := context.WithTimeout(context.Background(), 5*time.Second)
			err := client.Ping(pingCtx, readpref.Primary())
			pingCancel()

			if err == nil {
				logs.Debug("Replica set is ready (PRIMARY exists)")
				return nil
			}
			// Continue waiting if ping failed
		}
	}
}

func Cleanup(ctx context.Context, client *mongo.Client) {
	if client == nil {
		return
	}
	_ = client.Disconnect(ctx)
}
