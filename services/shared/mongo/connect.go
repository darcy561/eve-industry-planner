package mongo

import (
	"context"
	"errors"
	"fmt"
	"time"

	"eve-industry-planner/shared/core/config"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/retry"

	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"go.opentelemetry.io/contrib/instrumentation/go.mongodb.org/mongo-driver/v2/mongo/otelmongo"
)

func connectMongo(mongoURL string, connectionName string, configureOpts func(*options.ClientOptions)) (*mongo.Client, error) {
	const retryCount = 5
	const retryDelay = 5 * time.Second
	bg := context.Background()

	var connected *mongo.Client
	err := retry.Do(bg, func(context.Context) error {
		opts := options.Client().ApplyURI(mongoURL)
		configureOpts(opts)

		client, err := mongo.Connect(opts)
		if err != nil {
			return err
		}

		ctx, cancel := context.WithTimeout(bg, 5*time.Second)
		defer cancel()
		if err := client.Ping(ctx, nil); err != nil {
			_ = client.Disconnect(bg)
			return err
		}
		connected = client
		return nil
	}, func(err error, at retry.AttemptContext) bool {
		logs.ErrorCtx(bg, "mongo connection attempt failed",
			"connection", connectionName,
			"attempt", at.Attempt,
			"max_attempts", at.MaxAttempts,
			"error", err)
		return true
	},
		retry.WithMaxAttempts(retryCount),
		// A server that is still starting comes up on its own schedule, so the
		// wait stays flat rather than growing away from it.
		retry.WithInitialDelay(retryDelay),
		retry.WithMaxDelay(retryDelay),
	)
	if err != nil {
		logs.ErrorCtx(bg, "mongo connection gave up",
			"connection", connectionName,
			"attempts", retryCount,
			"error", err)
		return nil, fmt.Errorf("connect to %s after %d attempts: %w", connectionName, retryCount, err)
	}

	logs.DebugCtx(bg, "mongo connected", "connection", connectionName)
	go monitorMongoConnection(connected)
	return connected, nil
}

// applyBaseOpts sets the connection settings shared by every client.
func applyBaseOpts(opts *options.ClientOptions) {
	opts.SetConnectTimeout(10 * time.Second)
	opts.SetServerSelectionTimeout(10 * time.Second)
	opts.SetHeartbeatInterval(10 * time.Second)
	opts.SetMaxPoolSize(10)
	opts.SetMinPoolSize(1)
	opts.SetRetryWrites(true)
	opts.SetRetryReads(true)
	opts.SetBSONOptions(&options.BSONOptions{DefaultDocumentM: true})
	opts.SetMonitor(otelmongo.NewMonitor())
}

func connectFromURL(urlFn func() (string, error)) (*mongo.Client, error) {
	mongoURL, err := urlFn()
	if err != nil {
		return nil, err
	}
	configureOpts := func(opts *options.ClientOptions) {
		applyBaseOpts(opts)
		opts.SetTimeout(10 * time.Second)
	}
	return connectMongo(mongoURL, "Mongo", configureOpts)
}

// watchPoolSpare covers the connection-monitor ping and reconnect overlap alongside the
// streams, which each hold a connection for as long as they are awaiting events.
const watchPoolSpare = 4

func watchClientFromURL(urlFn func() (string, error), streams uint64) (*mongo.Client, error) {
	mongoURL, err := urlFn()
	if err != nil {
		return nil, err
	}
	configureOpts := func(opts *options.ClientOptions) {
		applyBaseOpts(opts)
		opts.SetMaxPoolSize(streams + watchPoolSpare)
	}
	return connectMongo(mongoURL, "Mongo (watch)", configureOpts)
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

// ConnectWatch returns a [Mongo] handle for change streams. It sets no client-wide operation
// timeout, so a cursor may block until an event arrives; callers bound the server wait with
// MaxAwaitTime. streams is the number of concurrent change streams the caller will open, and
// sizes the connection pool. Use [ConnectPrimary] for request/response work.
func ConnectWatch(streams uint64) (*Mongo, error) {
	if streams == 0 {
		return nil, errors.New("mongo: ConnectWatch requires at least one stream")
	}
	client, err := watchClientFromURL(config.MongoURL, streams)
	if err != nil {
		return nil, err
	}
	return NewMongo(client)
}

// monitorMongoConnection periodically Pings the shared client for observability.
// The driver recovers via SDAM and the connection pool; this loop does not rebuild the client.
func monitorMongoConnection(client *mongo.Client) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	bg := context.Background()

	for range ticker.C {
		ctx, cancel := context.WithTimeout(bg, 5*time.Second)
		err := client.Ping(ctx, nil)
		cancel()
		if err == nil {
			continue
		}
		logs.WarnCtx(bg, "MongoDB Ping failed", "error", err)
		time.Sleep(2 * time.Second)
		ctx, cancel = context.WithTimeout(bg, 5*time.Second)
		if err := client.Ping(ctx, nil); err == nil {
			logs.InfoCtx(bg, "MongoDB Ping recovered")
		} else {
			logs.WarnCtx(bg, "MongoDB Ping still failing", "error", err)
		}
		cancel()
	}
}
