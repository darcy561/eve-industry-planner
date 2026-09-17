// Package contract holds the dependencies and handler type the job packages take.
// Kept separate so those packages do not import core/scheduler, which declares them.
package contract

import (
	"context"
	"encoding/json/jsontext"

	"eve-industry-planner/shared/esiclient"
	eipmongo "eve-industry-planner/shared/mongo"
	eipnats "eve-industry-planner/shared/nats"

	eipredis "eve-industry-planner/shared/redis"
)

// Dependencies contains all possible dependencies for schedulers
type Dependencies struct {
	NATS  *eipnats.NATS
	Redis *eipredis.Redis
	Mongo *eipmongo.Mongo
	// ESI answers what the rate limiter knows: whether the servers are
	// answering, and whether a run's token cost can be absorbed.
	ESI esiclient.API
}

// TaskHandler defines a function that triggers a task
// data is the optional JSON-encoded data passed in the schedule request
type TaskHandler func(ctx context.Context, data jsontext.Value) error
