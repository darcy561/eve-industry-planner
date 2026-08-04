package mongo

import (
	"context"
	"errors"
	"fmt"
	"time"

	"eve-industry-planner/shared/core/config"
	"eve-industry-planner/shared/logs"

	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"go.opentelemetry.io/contrib/instrumentation/go.mongodb.org/mongo-driver/v2/mongo/otelmongo"
)

func connectMongo(mongoURL string, connectionName string, configureOpts func(*options.ClientOptions)) (*mongo.Client, error) {
	retryCount := 5
	retryDelay := 5 * time.Second
	bg := context.Background()

	for i := 0; i < retryCount; i++ {
		opts := options.Client().ApplyURI(mongoURL)
		configureOpts(opts)

		client, err := mongo.Connect(opts)
		if err == nil {
			ctx, cancel := context.WithTimeout(bg, 5*time.Second)
			err = client.Ping(ctx, nil)
			cancel()

			if err == nil {
				i++
				logs.DebugCtx(bg, fmt.Sprintf("Connected to %s on attempt %d/%d", connectionName, i, retryCount))
				go monitorMongoConnection(client)
				return client, nil
			}
			_ = client.Disconnect(bg)
		}
		i++
		logs.ErrorCtx(bg, fmt.Sprintf("Failed to connect to %s. Attempt %d/%d. Error: %v", connectionName, i, retryCount, err))
		time.Sleep(retryDelay)
	}

	message := fmt.Sprintf("Failed to connect to %s after %d attempts. Exiting...", connectionName, retryCount)
	logs.ErrorCtx(bg, message)
	return nil, errors.New(message)
}

func connectFromURL(urlFn func() (string, error)) (*mongo.Client, error) {
	mongoURL, err := urlFn()
	if err != nil {
		return nil, err
	}
	configureOpts := func(opts *options.ClientOptions) {
		opts.SetConnectTimeout(10 * time.Second)
		opts.SetServerSelectionTimeout(10 * time.Second)
		opts.SetTimeout(10 * time.Second)
		opts.SetHeartbeatInterval(10 * time.Second)
		opts.SetMaxPoolSize(10)
		opts.SetMinPoolSize(1)
		opts.SetRetryWrites(true)
		opts.SetRetryReads(true)
		opts.SetBSONOptions(&options.BSONOptions{DefaultDocumentM: true})
		opts.SetMonitor(otelmongo.NewMonitor())
	}
	return connectMongo(mongoURL, "Mongo", configureOpts)
}

func mongoFromURL(urlFn func() (string, error)) (*Mongo, error) {
	client, err := connectFromURL(urlFn)
	if err != nil {
		return nil, err
	}
	return NewMongo(client)
}

// ConnectPrimary connects with shared MONGO_USERNAME/PASSWORD and returns a [Mongo] handle.
func ConnectPrimary() (*Mongo, error) {
	return mongoFromURL(config.MongoURL)
}

// ConnectAPI connects with API credentials when set (else shared) and returns a [Mongo] handle.
func ConnectAPI() (*Mongo, error) {
	return mongoFromURL(config.MongoURLAPI)
}

func monitorMongoConnection(client *mongo.Client) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	bg := context.Background()

	for range ticker.C {
		ctx, cancel := context.WithTimeout(bg, 5*time.Second)
		err := client.Ping(ctx, nil)
		cancel()

		if err != nil {
			logs.WarnCtx(bg, "MongoDB connection health check failed, attempting reconnect", "error", err)
			time.Sleep(2 * time.Second)
			ctx, cancel := context.WithTimeout(bg, 5*time.Second)
			if err := client.Ping(ctx, nil); err == nil {
				logs.InfoCtx(bg, "MongoDB reconnected successfully")
			}
			cancel()
		}
	}
}
