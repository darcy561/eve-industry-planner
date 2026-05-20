package documentlock

import (
	"github.com/nats-io/nats.go/jetstream"
	"github.com/redis/go-redis/v9"
	mongodriver "go.mongodb.org/mongo-driver/mongo"

	"eve-industry-planner/shared"
)

// Deps holds infrastructure used by document-lock operations (HTTP, WebSocket, subscribers).
type Deps struct {
	Redis     *redis.Client
	Mongo     *mongodriver.Client
	JetStream jetstream.JetStream
}

// DepsFromServiceClients maps the shared service bundle into Deps.
func DepsFromServiceClients(c *shared.ServiceClients) Deps {
	if c == nil {
		return Deps{}
	}
	return Deps{
		Redis:     c.Redis,
		Mongo:     c.Mongo,
		JetStream: c.JetStream,
	}
}
