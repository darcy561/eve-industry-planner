package tasks

import (
	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/shared/core/objectstore"
	"eve-industry-planner/shared/stackservices"
	esiratelimiter "eve-industry-planner/worker/ratelimiter"

	"github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
	"github.com/redis/go-redis/v9"
)

// TaskDependencies holds stack clients and ESI rate-limiter used by worker task handlers.
// Built at the asynq mux composition root — handlers take *TaskDependencies, not *stackservices.Clients.
type TaskDependencies struct {
	Mongo       *eipmongo.Mongo
	NATS        *nats.Conn
	JetStream   jetstream.JetStream
	Redis       *redis.Client
	ObjectStore objectstore.Backend
	ESIClient   esiratelimiter.ClientInterface
}

// FromClients maps a stackservices.Clients bag plus ESI into TaskDependencies.
func FromClients(c *stackservices.Clients, esi esiratelimiter.ClientInterface) *TaskDependencies {
	d := &TaskDependencies{ESIClient: esi}
	if c == nil {
		return d
	}
	d.Mongo = c.Mongo
	d.NATS = c.NATS
	d.JetStream = c.JetStream
	d.Redis = c.Redis
	d.ObjectStore = c.ObjectStore
	return d
}
