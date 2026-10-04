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

func connectMongo(ctx context.Context, mongoURL string, connectionName string, configureOpts func(*options.ClientOptions)) (*mongo.Client, error) {
	const retryCount = 5
	const retryDelay = 5 * time.Second

	var connected *mongo.Client
	err := retry.Do(ctx, func(context.Context) error {
		opts := options.Client().ApplyURI(mongoURL)
		configureOpts(opts)

		client, err := mongo.Connect(opts)
		if err != nil {
			return err
		}

		ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
		defer cancel()
		if err := client.Ping(ctx, nil); err != nil {
			_ = client.Disconnect(context.WithoutCancel(ctx))
			return err
		}
		connected = client
		return nil
	}, func(err error, at retry.AttemptContext) bool {
		logs.ErrorCtx(ctx, "mongo connection attempt failed",
			"connection", connectionName,
			"attempt", at.Attempt,
			"max_attempts", at.MaxAttempts,
			"error", err)
		return true
	},
		retry.WithMaxAttempts(retryCount),
		retry.WithInitialDelay(retryDelay),
		retry.WithMaxDelay(retryDelay),
	)
	if err != nil {
		logs.ErrorCtx(ctx, "mongo connection gave up",
			"connection", connectionName,
			"attempts", retryCount,
			"error", err)
		return nil, fmt.Errorf("connect to %s after %d attempts: %w", connectionName, retryCount, err)
	}

	logs.DebugCtx(ctx, "mongo connected", "connection", connectionName)
	go monitorMongoConnection(connected, connectionMonitorInterval)
	return connected, nil
}

// connectionMonitorInterval is how often a connected client is pinged to log its health.
const connectionMonitorInterval = 30 * time.Second

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

func connectFromURL(ctx context.Context, urlFn func() (string, error)) (*mongo.Client, error) {
	mongoURL, err := urlFn()
	if err != nil {
		return nil, err
	}
	configureOpts := func(opts *options.ClientOptions) {
		applyBaseOpts(opts)
		opts.SetTimeout(10 * time.Second)
	}
	return connectMongo(ctx, mongoURL, "Mongo", configureOpts)
}

// watchPoolSpare covers the connection-monitor ping and reconnect overlap alongside the
// streams, which each hold a connection for as long as they are awaiting events.
const watchPoolSpare = 4

func watchClientFromURL(ctx context.Context, urlFn func() (string, error), streams uint64) (*mongo.Client, error) {
	mongoURL, err := urlFn()
	if err != nil {
		return nil, err
	}
	configureOpts := func(opts *options.ClientOptions) {
		applyBaseOpts(opts)
		opts.SetMaxPoolSize(streams + watchPoolSpare)
	}
	return connectMongo(ctx, mongoURL, "Mongo (watch)", configureOpts)
}

func mongoFromURL(ctx context.Context, urlFn func() (string, error)) (*Mongo, error) {
	client, err := connectFromURL(ctx, urlFn)
	if err != nil {
		return nil, err
	}
	return NewMongo(client)
}

// ConnectPrimary connects with the shared credentials and returns a [Mongo] handle, retrying until
// it connects, gives up, or ctx ends.
func ConnectPrimary(ctx context.Context) (*Mongo, error) {
	return mongoFromURL(ctx, config.MongoURL)
}

// ConnectWatch returns a handle for change streams, with no operation timeout and a pool sized to
// streams; use [ConnectPrimary] for request and response work.
func ConnectWatch(ctx context.Context, streams uint64) (*Mongo, error) {
	if streams == 0 {
		return nil, errors.New("mongo: ConnectWatch requires at least one stream")
	}
	client, err := watchClientFromURL(ctx, config.MongoURL, streams)
	if err != nil {
		return nil, err
	}
	return NewMongo(client)
}

// monitorMongoConnection pings client every interval to log its health, and stops once the client
// has been disconnected; the driver recovers connections itself, so it never rebuilds the client.
func monitorMongoConnection(client *mongo.Client, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	bg := context.Background()

	ping := func() error {
		ctx, cancel := context.WithTimeout(bg, 5*time.Second)
		defer cancel()
		return client.Ping(ctx, nil)
	}
	for range ticker.C {
		err := ping()
		if errors.Is(err, mongo.ErrClientDisconnected) {
			return
		}
		if err == nil {
			continue
		}
		logs.WarnCtx(bg, "MongoDB Ping failed", "error", err)
		time.Sleep(2 * time.Second)
		switch err := ping(); {
		case errors.Is(err, mongo.ErrClientDisconnected):
			return
		case err == nil:
			logs.InfoCtx(bg, "MongoDB Ping recovered")
		default:
			logs.WarnCtx(bg, "MongoDB Ping still failing", "error", err)
		}
	}
}
