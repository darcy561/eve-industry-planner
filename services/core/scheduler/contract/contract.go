// Package contract holds the scheduler interface and dependencies used by core/scheduler and core/scheduler/esi.
// Kept in a separate package to avoid an import cycle between scheduler and esi.
package contract

import (
	"context"
	"encoding/json"

	eipmongo "eve-industry-planner/shared/mongo"
	eipnats "eve-industry-planner/shared/nats"

	redislib "github.com/redis/go-redis/v9"
	"github.com/robfig/cron/v3"
)

// Dependencies contains all possible dependencies for schedulers
type Dependencies struct {
	Cron  *cron.Cron
	NATS  *eipnats.NATS
	Redis *redislib.Client
	Mongo *eipmongo.Mongo
}

// TaskHandler defines a function that triggers a task
// data is the optional JSON-encoded data passed in the schedule request
type TaskHandler func(ctx context.Context, data json.RawMessage) error

// Scheduler interface for dynamic task scheduling
type Scheduler interface {
	RegisterHandler(taskType string, handler TaskHandler)
	HasScheduledJob(taskType string) bool
	ScheduleCronJob(cronExpr string, taskType string) error
}
