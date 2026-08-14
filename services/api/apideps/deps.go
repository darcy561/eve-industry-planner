// Package apideps holds this API service’s shared backing connections for HTTP handlers.
// Composition root builds one Deps; handler packages embed it and use methods — do not
// thread Deps (or individual connections) as handler parameters.
package apideps

import (
	"eve-industry-planner/shared/core/documentlock"
	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/shared/stackservices"

	"github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
	"github.com/redis/go-redis/v9"
)

// Deps is this API process’s data-plane handles (not a browser/SPA client).
type Deps struct {
	Mongo     *eipmongo.Mongo
	Redis     *redis.Client
	NATS      *nats.Conn
	JetStream jetstream.JetStream
}

// FromClients maps the composition-root connect bag into Deps for handlers.
func FromClients(c *stackservices.Clients) *Deps {
	if c == nil {
		return &Deps{}
	}
	return &Deps{
		Mongo:     c.Mongo,
		Redis:     c.Redis,
		NATS:      c.NATS,
		JetStream: c.JetStream,
	}
}

// New returns Deps with only Mongo set (tests / mongo-only wiring). Prefer FromClients in the API process.
func New(mongo *eipmongo.Mongo) *Deps {
	return &Deps{Mongo: mongo}
}

func (d *Deps) LockDeps() documentlock.Deps {
	if d == nil {
		return documentlock.Deps{}
	}
	return documentlock.Deps{Mongo: d.Mongo, Redis: d.Redis, JetStream: d.JetStream}
}
