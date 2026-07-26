package documentlock

import (
	"eve-industry-planner/shared/stackservices"
	"github.com/nats-io/nats.go/jetstream"
	"github.com/redis/go-redis/v9"
	mongodriver "go.mongodb.org/mongo-driver/mongo"
)

// Deps holds infrastructure used by document-lock operations (HTTP, WebSocket, subscribers).
type Deps struct {
	Redis     *redis.Client
	Mongo     *mongodriver.Client
	JetStream jetstream.JetStream
}

// DepsFromClients maps the shared stack-service clients into Deps.
func DepsFromClients(c *stackservices.Clients) Deps {
	if c == nil {
		return Deps{}
	}
	return Deps{
		Redis:     c.Redis,
		Mongo:     c.Mongo,
		JetStream: c.JetStream,
	}
}
