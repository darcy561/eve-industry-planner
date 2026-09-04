package tasks

import (
	"eve-industry-planner/shared/core/objectstore"
	"eve-industry-planner/shared/crypto/entityid"
	"eve-industry-planner/shared/esiclient"
	eipmongo "eve-industry-planner/shared/mongo"
	eipnats "eve-industry-planner/shared/nats"
	"eve-industry-planner/shared/stackservices"

	"github.com/redis/go-redis/v9"
)

// TaskDependencies holds stack clients and ESI rate-limiter used by worker task handlers.
// Built at the asynq mux composition root — handlers take *TaskDependencies, not *stackservices.Clients.
type TaskDependencies struct {
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
// TaskDependencies. refs derives entity refs; the connect bag does not carry it.
func FromClients(c *stackservices.Clients, esi esiclient.API, refs *entityid.Cipher) *TaskDependencies {
	d := &TaskDependencies{ESI: esi, EntityCipher: refs}
	if c == nil {
		return d
	}
	d.Mongo = c.Mongo
	d.NATS = c.NATS
	d.Redis = c.Redis
	d.ObjectStore = c.ObjectStore
	return d
}
