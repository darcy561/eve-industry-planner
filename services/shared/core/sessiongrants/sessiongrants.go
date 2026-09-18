// Package sessiongrants keeps an account's stored grants in step with the
// membership rows they are derived from, and tells the connections it changed
// under.
package sessiongrants

import (
	"context"
	"fmt"

	eipmongo "eve-industry-planner/shared/mongo"
	eipnats "eve-industry-planner/shared/nats"
	"eve-industry-planner/shared/plannersession"
	eipredis "eve-industry-planner/shared/redis"
)

// WriteFromMemberships rewrites an account's stored grants from the membership
// rows it holds now.
//
// Every path that adds or removes a membership row owes this call — the join
// endpoint as much as the tasks that reconcile against ESI. The grants on
// a session record are a cache of one Mongo query, and a session lives for days:
// rows removed without it leave an account reaching planners it is no longer a
// member of until something else rewrites the record.
//
// Resolved here rather than in the session store, which holds sessions in Redis
// and deliberately reads no database — a membership query there would give that
// package a second home for the same lookup.
func WriteFromMemberships(ctx context.Context, mongo *eipmongo.Mongo, redis *eipredis.Redis, nats *eipnats.NATS, accountID string) error {
	if mongo == nil || redis == nil || accountID == "" {
		return fmt.Errorf("sessiongrants: invalid arguments")
	}
	granted, err := mongo.OwnerKeysForAccount(ctx, accountID)
	if err != nil {
		return fmt.Errorf("resolve owners for %s: %w", accountID, err)
	}
	if err := plannersession.NewStore(redis).SetGrants(ctx, accountID, granted); err != nil {
		return fmt.Errorf("write grants for %s: %w", accountID, err)
	}
	// Announced after the write, so a replica that acts on it narrows to a
	// ceiling the record already agrees with. A connection open now holds the
	// ceiling it was given at connect and would otherwise keep a planner the
	// account has left until it reconnects.
	if nats != nil {
		if err := eipnats.PublishSessionGrantsChanged(nats, accountID, granted); err != nil {
			return fmt.Errorf("announce grants for %s: %w", accountID, err)
		}
	}
	return nil
}
