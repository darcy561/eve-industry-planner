package mongo

import (
	"context"
	"errors"
	"fmt"
	"os"
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

// ConnectMongo establishes a client and returns it.
func Connect() (*mongo.Client, error) {
	cfg := config.LoadConfig()

	retryCount := 5
	retryDelay := 5 * time.Second

	for i := 0; i < retryCount; i++ {
		// Configure MongoDB client with reconnection settings
		opts := options.Client().ApplyURI(cfg.MONGO_URL)
		opts.SetConnectTimeout(10 * time.Second)
		opts.SetServerSelectionTimeout(10 * time.Second)
		opts.SetSocketTimeout(10 * time.Second)
		opts.SetHeartbeatInterval(10 * time.Second)
		opts.SetMaxPoolSize(10) // Match IncomingPoolSize (10 workers) to allow full concurrent DB operations
		opts.SetMinPoolSize(1)  // Minimal warm pool, scales automatically up to MaxPoolSize under load
		// Enable automatic reconnection
		opts.SetRetryWrites(true)
		opts.SetRetryReads(true)

		client, err := mongo.Connect(context.Background(), opts)
		if err == nil {
			// Verify connection by pinging
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			err = client.Ping(ctx, nil)
			cancel()

			if err == nil {
				i++
				message := fmt.Sprintf("Connected to Mongo on attempt %d/%d", i, retryCount)
				logs.Debug(message)

				// Start background monitoring for connection health
				go monitorMongoConnection(client)

				return client, nil
			}
			// If ping failed, close client and retry
			_ = client.Disconnect(context.Background())
		}
		i++
		message := fmt.Sprintf("Failed to connect to Mongo. Attempt %d/%d. Error: %v", i, retryCount, err)
		logs.Error(message)
		time.Sleep(retryDelay)
	}

	message := fmt.Sprintf("Failed to connect to Mongo after %d attempts. Exiting...", retryCount)
	logs.Error(message)
	return nil, errors.New(message)
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
// Uses MONGO_SECONDARY_URL if set, otherwise defaults to mongo-secondary:27017
func ConnectSecondary() (*mongo.Client, error) {
	// Default to mongo-secondary if MONGO_SECONDARY_URL is not set
	mongoURL := os.Getenv("MONGO_SECONDARY_URL")
	if mongoURL == "" {
		mongoURL = "mongodb://mongo-secondary:27017/eve_industry_planner"
	}

	retryCount := 5
	retryDelay := 5 * time.Second

	for i := 0; i < retryCount; i++ {
		// Configure MongoDB client with reconnection settings
		opts := options.Client().ApplyURI(mongoURL)
		opts.SetConnectTimeout(10 * time.Second)
		opts.SetServerSelectionTimeout(10 * time.Second)
		opts.SetSocketTimeout(10 * time.Second)
		opts.SetHeartbeatInterval(10 * time.Second)
		opts.SetMaxPoolSize(10) // Lower pool size for read-only secondary
		opts.SetMinPoolSize(1)
		// Enable automatic reconnection
		opts.SetRetryWrites(false) // Secondaries don't accept writes
		opts.SetRetryReads(true)
		// Read preference for secondary - prefer secondary, fallback to primary
		opts.SetReadPreference(readpref.SecondaryPreferred())

		client, err := mongo.Connect(context.Background(), opts)
		if err == nil {
			// Verify connection by pinging
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			err = client.Ping(ctx, nil)
			cancel()

			if err == nil {
				i++
				message := fmt.Sprintf("Connected to Mongo Secondary on attempt %d/%d", i, retryCount)
				logs.Debug(message)

				// Start background monitoring for connection health
				go monitorMongoConnection(client)

				return client, nil
			}
			// If ping failed, close client and retry
			_ = client.Disconnect(context.Background())
		}
		i++
		message := fmt.Sprintf("Failed to connect to Mongo Secondary. Attempt %d/%d. Error: %v", i, retryCount, err)
		logs.Error(message)
		time.Sleep(retryDelay)
	}

	message := fmt.Sprintf("Failed to connect to Mongo Secondary after %d attempts. Exiting...", retryCount)
	logs.Error(message)
	return nil, errors.New(message)
}

func Cleanup(ctx context.Context, client *mongo.Client) {
	if client == nil {
		return
	}
	_ = client.Disconnect(ctx)
}
