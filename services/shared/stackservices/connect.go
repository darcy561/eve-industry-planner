// Package stackservices connects app roles to stack data-plane services
// (mongo, nats, redis, object store). Hosts come from env / stack anchors;
// Services selects which clients to open — each role passes an explicit set.
package stackservices

import (
	"context"
	"fmt"

	"eve-industry-planner/shared/core/objectstore"
	"eve-industry-planner/shared/core/redis"
	eipmongo "eve-industry-planner/shared/mongo"
	eipnats "eve-industry-planner/shared/nats"

	redislib "github.com/redis/go-redis/v9"
)

// Services selects which stack data-plane clients to open.
// Not DNS names — hosts are MONGO_HOST / REDIS_HOST / NATS_URL / S3_URL from the stack.
type Services struct {
	Mongo       bool
	NATS        bool
	Redis       bool
	ObjectStore bool // static-data bucket (SeaweedFS / S3)
}

// Common single-service selections for CLI / one-shots.
var (
	Mongo       = Services{Mongo: true}
	NATS        = Services{NATS: true}
	Redis       = Services{Redis: true}
	ObjectStore = Services{ObjectStore: true}
)

// Clients holds open stack-service clients (no shutdown list).
type Clients struct {
	Mongo       *eipmongo.Mongo
	NATS        *eipnats.NATS
	Redis       *redislib.Client
	ObjectStore objectstore.Backend
}

// Connect opens clients for the selected stack services with shared DB creds
// (MONGO_USERNAME / MONGO_PASSWORD, REDIS_PASSWORD).
// On error, any partial connections are closed and the stop func is a no-op.
func Connect(ctx context.Context, services Services) (*Clients, func(context.Context), error) {
	clients := &Clients{}
	var cleanups []func(context.Context)

	stop := func(c context.Context) {
		for i := len(cleanups) - 1; i >= 0; i-- {
			if cleanups[i] != nil {
				cleanups[i](c)
			}
		}
	}
	noop := func(context.Context) {}

	fail := func(err error) (*Clients, func(context.Context), error) {
		stop(context.Background())
		return nil, noop, err
	}

	if services.Mongo {
		mongoHandle, err := eipmongo.ConnectPrimary()
		if err != nil {
			return fail(fmt.Errorf("failed to connect to mongo: %w", err))
		}
		clients.Mongo = mongoHandle
		cleanups = append(cleanups, func(c context.Context) { mongoHandle.Disconnect(c) })
	}

	if services.NATS {
		natsHandle, err := eipnats.Open(ctx)
		if err != nil {
			return fail(fmt.Errorf("failed to connect to nats: %w", err))
		}
		clients.NATS = natsHandle
		cleanups = append(cleanups, func(context.Context) { natsHandle.Close() })
	}

	if services.Redis {
		redisClient, err := redis.Connect()
		if err != nil {
			return fail(fmt.Errorf("failed to connect to redis: %w", err))
		}
		clients.Redis = redisClient
		cleanups = append(cleanups, func(c context.Context) { redis.Cleanup(c, redisClient) })
	}

	if services.ObjectStore {
		backend, err := objectstore.OpenStaticData(ctx)
		if err != nil {
			return fail(fmt.Errorf("failed to open object store: %w", err))
		}
		clients.ObjectStore = backend
	}

	return clients, stop, nil
}
