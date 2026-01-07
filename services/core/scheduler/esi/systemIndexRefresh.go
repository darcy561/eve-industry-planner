package esi

import (
	"context"
	"encoding/json"

	natscore "eve-industry-planner/shared/core/nats"
	"eve-industry-planner/shared/scheduler"
	taskscore "eve-industry-planner/shared/tasks"
)

// ScheduleIndustrySystemsRefresh sets up a static cron job for industry systems refresh (hourly).
// Returns a cleanup function and an error if scheduling fails.
func ScheduleIndustrySystemsRefresh(deps scheduler.Dependencies, sched scheduler.Scheduler) (func(), error) {
	jsContext := deps.JSContext
	natsConn := deps.NATS
	log := deps.Log

	// Register the task handler
	sched.RegisterHandler(taskscore.TaskTypeRefreshSystemIndexes, func(ctx context.Context, data json.RawMessage) error {
		// Just publish to JetStream - the worker will handle the actual refresh
		subject := natscore.SubjectRefreshSystemIndexes
		log.Debug("publishing industry systems refresh trigger", "subject", subject)

		// Publish empty message for simple trigger messages with retry logic
		if err := natscore.PublishEmpty(jsContext, subject, natsConn); err != nil {
			log.Error("failed to publish industry systems refresh trigger", "subject", subject, "error", err)
			return err
		}

		log.Info("industry systems refresh triggered", "subject", subject)
		return nil
	})
	return func() {}, nil
}
