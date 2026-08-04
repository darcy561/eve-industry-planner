// Package stackservices connects app roles to stack data-plane services
// (mongo, nats, redis, object store). Hosts come from env / stack anchors;
// Services selects which clients to open — each role passes an explicit set.
package stackservices

import (
	"context"
	"fmt"

	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/shared/core/nats"
	"eve-industry-planner/shared/core/objectstore"
	"eve-industry-planner/shared/core/redis"

	natslib "github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
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
	NATS        *natslib.Conn
	JetStream   jetstream.JetStream
	Redis       *redislib.Client
	ObjectStore objectstore.Backend
}

// Connect opens clients for the selected stack services with shared DB creds.
// On error, any partial connections are closed and the stop func is a no-op.
func Connect(ctx context.Context, services Services) (*Clients, func(context.Context), error) {
	return connect(ctx, false, services)
}

// ConnectAPI is Connect using eipmongo.ConnectAPI / redis.ConnectAPI
// (MONGO_*_API / REDIS_*_API when set). Call from the api role only.
func ConnectAPI(ctx context.Context, services Services) (*Clients, func(context.Context), error) {
	return connect(ctx, true, services)
}

func connect(ctx context.Context, apiCreds bool, services Services) (*Clients, func(context.Context), error) {
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
		var mongoHandle *eipmongo.Mongo
		var err error
		if apiCreds {
			mongoHandle, err = eipmongo.ConnectAPI()
		} else {
			mongoHandle, err = eipmongo.ConnectPrimary()
		}
		if err != nil {
			return fail(fmt.Errorf("failed to connect to mongo: %w", err))
		}
		clients.Mongo = mongoHandle
		cleanups = append(cleanups, func(c context.Context) { mongoHandle.Disconnect(c) })
	}

	if services.NATS {
		natsConn, jsContext, err := nats.ConnectJetStream()
		if err != nil {
			return fail(fmt.Errorf("failed to connect to nats: %w", err))
		}
		clients.NATS = natsConn
		clients.JetStream = jsContext
		cleanups = append(cleanups, func(c context.Context) { nats.Cleanup(natsConn) })
	}

	if services.Redis {
		var redisClient *redislib.Client
		var err error
		if apiCreds {
			redisClient, err = redis.ConnectAPI()
		} else {
			redisClient, err = redis.Connect()
		}
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
