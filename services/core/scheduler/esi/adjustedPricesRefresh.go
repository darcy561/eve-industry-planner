package esi

import (
	"context"
	"encoding/json"

	natscore "eve-industry-planner/shared/core/nats"
	"eve-industry-planner/shared/scheduler"
	taskscore "eve-industry-planner/shared/tasks"
)

// ScheduleAdjustedPricesRefresh sets up a static cron job for adjusted prices refresh (hourly).
// Returns a cleanup function and an error if scheduling fails.
func ScheduleAdjustedPricesRefresh(deps scheduler.Dependencies, sched scheduler.Scheduler) (func(), error) {
	jsContext := deps.JSContext
	natsConn := deps.NATS
	log := deps.Log

	// Register the task handler
	sched.RegisterHandler(taskscore.TaskTypeRefreshAdjustedPrices, func(ctx context.Context, data json.RawMessage) error {
		// Just publish to JetStream - the worker will handle the actual refresh
		subject := natscore.SubjectRefreshAdjustedPrices
		log.Debug("publishing adjusted prices refresh trigger", "subject", subject)

		// Use standard EmptyMessage helper for simple trigger messages with retry logic
		if err := scheduler.PublishEmptyMessage(jsContext, subject, natsConn); err != nil {
			log.Error("failed to publish adjusted prices refresh trigger", "subject", subject, "error", err)
			return err
		}

		log.Info("adjusted prices refresh triggered", "subject", subject)
		return nil
	})

	return func() {}, nil
}
