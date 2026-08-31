package documentlock

import (
	eipmongo "eve-industry-planner/shared/mongo"
	eipnats "eve-industry-planner/shared/nats"
	"eve-industry-planner/shared/stackservices"

	"github.com/redis/go-redis/v9"
)

// Deps holds infrastructure used by document-lock operations (HTTP, WebSocket, subscribers).
type Deps struct {
	Redis *redis.Client
	Mongo *eipmongo.Mongo
	NATS  *eipnats.NATS
}

// DepsFromClients maps the shared stack-service clients into Deps.
func DepsFromClients(c *stackservices.Clients) Deps {
	if c == nil {
		return Deps{}
	}
	return Deps{
		Redis: c.Redis,
		Mongo: c.Mongo,
		NATS:  c.NATS,
	}
}
