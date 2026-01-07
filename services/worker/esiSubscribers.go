package main

import (
	"context"
	natscore "eve-industry-planner/shared/core/nats"
	esitasks "eve-industry-planner/worker/tasks/esi"
)

// SubscribeScheduledTasks sets up the JetStream pull consumer for all scheduled tasks (task.scheduled.>).
// Routes messages to the appropriate task function based on the actual subject.
// Returns a cleanup function and an error if subscription fails.
func SubscribeScheduledTasks(deps *WorkerDependencies) (func(context.Context), error) {
	return SubscribeToSubjectGroup(deps, GroupedSubscriberConfig{
		Subject:      "task.scheduled.>",
		ConsumerName: natscore.ConsumerTaskScheduled,
		StreamName:   natscore.WorkerTaskStream,
		TaskName:     "scheduled tasks",
		TaskRoutes: map[string]TaskFunc{
			natscore.SubjectRefreshSystemIndexes:  esitasks.RefreshSystemIndexes,
			natscore.SubjectRefreshAdjustedPrices: esitasks.RefreshAdjustedPrices,
			natscore.SubjectRefreshMarketPrices:   esitasks.RefreshMarketPrices,
		},
	})
}

// SubscribeAuthTasks sets up the JetStream pull consumer for all auth tasks (task.auth.>).
// Routes messages to the appropriate task function based on the actual subject.
// Returns a cleanup function and an error if subscription fails.
func SubscribeAuthTasks(deps *WorkerDependencies) (func(context.Context), error) {
	return SubscribeToSubjectGroup(deps, GroupedSubscriberConfig{
		Subject:      "task.auth.>",
		ConsumerName: natscore.ConsumerTaskAuth,
		StreamName:   natscore.WorkerTaskStream,
		TaskName:     "auth tasks",
		TaskRoutes: map[string]TaskFunc{
			natscore.SubjectFetchCorporations: esitasks.UpdateCustomCorporationClaims,
		},
	})
}
