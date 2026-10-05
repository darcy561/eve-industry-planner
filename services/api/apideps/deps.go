// Package apideps holds this API service’s shared backing connections for HTTP handlers.
package apideps

import (
	"context"

	"eve-industry-planner/shared/appconfig"
	"eve-industry-planner/shared/core/documentlock"
	"eve-industry-planner/shared/crypto/entityid"
	"eve-industry-planner/shared/esiclient"
	"eve-industry-planner/shared/evesso"
	eipmongo "eve-industry-planner/shared/mongo"
	eipnats "eve-industry-planner/shared/nats"
	eipredis "eve-industry-planner/shared/redis"
	"eve-industry-planner/shared/stackservices"
)

// Deps is this API process’s data-plane handles (not a browser/SPA client).
type Deps struct {
	Mongo        *eipmongo.Mongo
	Redis        *eipredis.Redis
	NATS         *eipnats.NATS
	EntityCipher *entityid.Cipher
	ESI          esiclient.API
	Maintenance  *appconfig.MaintenanceFlag
}

// FromClients maps the composition-root connect bag into Deps for handlers.
func FromClients(c *stackservices.Clients, refs *entityid.Cipher, esi esiclient.API, maintenance *appconfig.MaintenanceFlag) *Deps {
	if c == nil {
		return &Deps{ESI: esi, Maintenance: maintenance}
	}
	return &Deps{
		Mongo:        c.Mongo,
		Redis:        c.Redis,
		NATS:         c.NATS,
		EntityCipher: refs,
		ESI:          esi,
		Maintenance:  maintenance,
	}
}

// MaintenanceModeEnabled reports the live maintenance flag. Mongo-only wiring
// carries no flag and reads as off.
func (d *Deps) MaintenanceModeEnabled(ctx context.Context) bool {
	if d == nil || d.Maintenance == nil {
		return false
	}
	return d.Maintenance.Enabled(ctx)
}

// New returns Deps with only Mongo set (tests / mongo-only wiring). Prefer FromClients in the API process.
func New(mongo *eipmongo.Mongo) *Deps {
	return &Deps{Mongo: mongo}
}

// ReportSSO tells the shared limiter whether EVE SSO answered.
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
	return documentlock.Deps{Redis: d.Redis, NATS: d.NATS}
}
