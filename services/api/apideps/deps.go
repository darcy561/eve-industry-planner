// Package apideps holds this API service’s shared backing connections for HTTP handlers.
// Composition root builds one Deps; handler packages embed it and use methods — do not
// thread Deps (or individual connections) as handler parameters.
package apideps

import (
	"context"

	"eve-industry-planner/shared/core/documentlock"
	"eve-industry-planner/shared/crypto/entityid"
	"eve-industry-planner/shared/esiclient"
	"eve-industry-planner/shared/evesso"
	eipmongo "eve-industry-planner/shared/mongo"
	eipnats "eve-industry-planner/shared/nats"
	"eve-industry-planner/shared/stackservices"

	"github.com/redis/go-redis/v9"
)

// Deps is this API process’s data-plane handles (not a browser/SPA client).
type Deps struct {
	Mongo *eipmongo.Mongo
	Redis *redis.Client
	NATS  *eipnats.NATS
	// EntityCipher derives the refs that replace raw entity ids. Nil in mongo-only
	// wiring, so handlers that write documents carrying ids must check it.
	EntityCipher *entityid.Cipher
	// ESI is the shared limiter. The api makes no metered ESI calls, so this is
	// here for what an outage stops rather than for what it meters: EVE SSO goes
	// down with everything else, and a caller that reports what it saw lets the
	// rest of the fleet stop retrying into it. Nil in mongo-only wiring.
	ESI esiclient.API
}

// FromClients maps the composition-root connect bag into Deps for handlers.
// refs derives entity refs and esi reaches the shared limiter; the connect bag
// carries neither.
func FromClients(c *stackservices.Clients, refs *entityid.Cipher, esi esiclient.API) *Deps {
	if c == nil {
		return &Deps{ESI: esi}
	}
	return &Deps{
		Mongo:        c.Mongo,
		Redis:        c.Redis,
		NATS:         c.NATS,
		EntityCipher: refs,
		ESI:          esi,
	}
}

// New returns Deps with only Mongo set (tests / mongo-only wiring). Prefer FromClients in the API process.
func New(mongo *eipmongo.Mongo) *Deps {
	return &Deps{Mongo: mongo}
}

// ReportSSO tells the shared limiter whether EVE SSO answered.
//
// SSO is not metered by ESI: it holds no bucket and spends no token. What it
// contributes is evidence, as its own source, about whether CCP's servers are
// up — which is the one thing an outage couples the two together by.
func (d *Deps) ReportSSO(ctx context.Context, err error) {
	if d == nil || d.ESI == nil {
		return
	}
	_ = d.ESI.Observe(ctx, "evesso", evesso.ServerAnswered(err))
}

func (d *Deps) LockDeps() documentlock.Deps {
	if d == nil {
		return documentlock.Deps{}
	}
	return documentlock.Deps{Mongo: d.Mongo, Redis: d.Redis, NATS: d.NATS}
}
