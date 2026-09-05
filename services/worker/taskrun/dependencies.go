// Package taskrun holds what a worker task has while it runs: the clients it
// works through, and what it can ask about its own execution.
//
// It is separate from the task packages because every one of them needs it, and
// separate from the composition root because the mux builds it once and hands it
// to each handler.
package taskrun

import (
	"eve-industry-planner/shared/core/objectstore"
	"eve-industry-planner/shared/crypto/entityid"
	"eve-industry-planner/shared/esiclient"
	eipmongo "eve-industry-planner/shared/mongo"
	eipnats "eve-industry-planner/shared/nats"
	"eve-industry-planner/shared/stackservices"

	"github.com/redis/go-redis/v9"
)

// Dependencies holds the stack clients and the ESI rate limiter a task handler
// works through. Built at the mux; handlers take this rather than the connect
// bag it comes from.
type Dependencies struct {
	Mongo       *eipmongo.Mongo
	NATS        *eipnats.NATS
	Redis       *redis.Client
	ObjectStore objectstore.Backend
	ESI         esiclient.API
	// EntityCipher derives the refs that replace raw entity ids. Built once at the
	// composition root so a missing key stops the worker starting rather than
	// failing individual tasks.
	EntityCipher *entityid.Cipher
}

// FromClients maps a stackservices.Clients bag plus the ESI client into
// Dependencies. refs derives entity refs; the connect bag does not carry it.
func FromClients(c *stackservices.Clients, esi esiclient.API, refs *entityid.Cipher) *Dependencies {
	d := &Dependencies{ESI: esi, EntityCipher: refs}
	if c == nil {
		return d
	}
	d.Mongo = c.Mongo
	d.NATS = c.NATS
	d.Redis = c.Redis
	d.ObjectStore = c.ObjectStore
	return d
}
