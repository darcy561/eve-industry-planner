package taskrun

import (
	"context"
	"fmt"

	eipnats "eve-industry-planner/shared/nats"
	"eve-industry-planner/shared/plannersession"
)

// WriteSessionGrantsFromMemberships rewrites an account's stored grants from the
// membership rows it holds now.
//
// Every task that adds or removes a membership row owes this call. The grants on
// a session record are a cache of one Mongo query, and a session lives for days:
// rows removed without it leave an account reaching planners it is no longer a
// member of until something else rewrites the record.
//
// Resolved here rather than in the session store, which holds sessions in Redis
// and deliberately reads no database — a membership query there would give that
// package a second home for the same lookup.
func WriteSessionGrantsFromMemberships(ctx context.Context, deps *Dependencies, accountID string) error {
	if deps == nil || deps.Mongo == nil || deps.Redis == nil || accountID == "" {
		return fmt.Errorf("WriteSessionGrantsFromMemberships: invalid arguments")
	}
	granted, err := deps.Mongo.OwnerKeysForAccount(ctx, accountID)
	if err != nil {
		return fmt.Errorf("resolve owners for %s: %w", accountID, err)
	}
	if err := plannersession.NewStore(deps.Redis).SetGrants(ctx, accountID, granted); err != nil {
		return fmt.Errorf("write grants for %s: %w", accountID, err)
	}
	// Announced after the write, so a replica that acts on it narrows to a
	// ceiling the record already agrees with. A connection open now holds the
	// ceiling it was given at connect and would otherwise keep a planner the
	// account has left until it reconnects.
	if deps.NATS != nil {
		if err := eipnats.PublishSessionGrantsChanged(deps.NATS, accountID, granted); err != nil {
			return fmt.Errorf("announce grants for %s: %w", accountID, err)
		}
	}
	return nil
}
