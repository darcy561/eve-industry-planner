// Package contract holds the scheduler interface and dependencies used by core/scheduler and core/scheduler/esi.
// Kept in a separate package to avoid an import cycle between scheduler and esi.
package contract

import (
	"context"
	"encoding/json"
	natslib "github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
	redislib "github.com/redis/go-redis/v9"
	"github.com/robfig/cron/v3"
	mongodriver "go.mongodb.org/mongo-driver/mongo"
)

// Dependencies contains all possible dependencies for schedulers
type Dependencies struct {
	Cron      *cron.Cron
	NATS      *natslib.Conn
	JSContext jetstream.JetStream
	Redis     *redislib.Client
	Mongo     *mongodriver.Client
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
