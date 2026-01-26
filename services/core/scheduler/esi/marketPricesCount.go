package esi

import (
	"context"
	"encoding/json"

	natscore "eve-industry-planner/shared/core/nats"
	"eve-industry-planner/shared/scheduler"
	taskscore "eve-industry-planner/shared/tasks"
)

// ScheduleMarketPricesCount sets up a periodic task to count the number of market prices items
// in the database. This count is cached and used by the main refresh handler to calculate batch sizes.
// Runs every 4 hours to keep the count accurate as items are added/removed.
// The task is published to NATS and processed by the worker service.
// Returns a cleanup function and an error if scheduling fails.
func ScheduleMarketPricesCount(deps scheduler.Dependencies, sched scheduler.Scheduler) (func(), error) {
	jsContext := deps.JSContext
	natsConn := deps.NATS
	log := deps.Log

	// Register the task handler
	sched.RegisterHandler(taskscore.TaskTypeCountMarketPricesItems, func(ctx context.Context, data json.RawMessage) error {
		// Just publish to JetStream - the worker will handle the actual counting
		subject := natscore.SubjectCountMarketPricesItems
		log.Debug("publishing market prices count trigger", "subject", subject)

		// Publish empty message for simple trigger messages with retry logic
		if err := natscore.PublishEmpty(jsContext, subject, natsConn); err != nil {
			log.Error("failed to publish market prices count trigger", "subject", subject, "error", err)
			return err
		}

		log.Info("market prices count triggered", "subject", subject)
		return nil
	})

	return func() {}, nil
}
