// Package contract holds the dependencies and handler type the job packages take.
// Kept separate so those packages do not import core/scheduler, which declares them.
package contract

import (
	"context"
	"encoding/json"

	eipmongo "eve-industry-planner/shared/mongo"
	eipnats "eve-industry-planner/shared/nats"

	redislib "github.com/redis/go-redis/v9"
)

// Dependencies contains all possible dependencies for schedulers
type Dependencies struct {
	NATS  *eipnats.NATS
	Redis *redislib.Client
	Mongo *eipmongo.Mongo
}

// TaskHandler defines a function that triggers a task
// data is the optional JSON-encoded data passed in the schedule request
type TaskHandler func(ctx context.Context, data json.RawMessage) error
