package main

import (
	"context"
	natscore "eve-industry-planner/shared/core/nats"
)

// SubscribeScheduledTasksHighPriority sets up JetStream pull consumers for high-priority scheduled tasks.
// These are tasks that need immediate processing (corporation claims).
// Returns a cleanup function and an error if subscription fails.
func SubscribeScheduledTasksHighPriority(deps *WorkerDependencies) (func(context.Context), error) {
	// Corporation claims consumer (ESI service, high priority)
	return SubscribeToESISubject(deps, SubscriberConfig{
		Subject:      natscore.SubjectFetchCorporations,
		ConsumerName: "task-scheduled-corporation-claims",
		StreamName:   natscore.WorkerTaskStream,
		TaskName:     "corporation claims",
	})
}

// SubscribeScheduledTasksRegularPriority sets up JetStream pull consumers for regular-priority scheduled tasks.
// These are singular tasks that won't back up (system indexes, adjusted prices, missing market prices).
// Returns a cleanup function and an error if subscription fails.
func SubscribeScheduledTasksRegularPriority(deps *WorkerDependencies) (func(context.Context), error) {
	// Create separate consumers for each regular-priority task type
	// This allows us to process them before low-priority tasks
	cleanups := []func(context.Context){}

	// System indexes consumer (ESI service)
	cleanup1, err := SubscribeToESISubject(deps, SubscriberConfig{
		Subject:      natscore.SubjectRefreshSystemIndexes,
		ConsumerName: "task-scheduled-system-indexes",
		StreamName:   natscore.WorkerTaskStream,
		TaskName:     "system indexes refresh",
	})
	if err != nil {
		return nil, err
	}
	cleanups = append(cleanups, cleanup1)

	// Adjusted prices consumer (ESI service)
	cleanup2, err := SubscribeToESISubject(deps, SubscriberConfig{
		Subject:      natscore.SubjectRefreshAdjustedPrices,
		ConsumerName: "task-scheduled-adjusted-prices",
		StreamName:   natscore.WorkerTaskStream,
		TaskName:     "adjusted prices refresh",
	})
	if err != nil {
		return nil, err
	}
	cleanups = append(cleanups, cleanup2)

	// Missing market prices consumer (ESI service, high priority)
	cleanup3, err := SubscribeToESISubject(deps, SubscriberConfig{
		Subject:      natscore.SubjectFetchMissingMarketPrices,
		ConsumerName: "task-missing-market-prices",
		StreamName:   natscore.WorkerTaskStream,
		TaskName:     "fetch missing market prices",
	})
	if err != nil {
		return nil, err
	}
	cleanups = append(cleanups, cleanup3)

	// Return combined cleanup function
	return func(ctx context.Context) {
		for _, cleanup := range cleanups {
			cleanup(ctx)
		}
	}, nil
}

// SubscribeScheduledTasksLowPriority sets up a JetStream pull consumer for low-priority scheduled tasks.
// These can have many messages queued (market prices refresh).
// Returns a cleanup function and an error if subscription fails.
func SubscribeScheduledTasksLowPriority(deps *WorkerDependencies) (func(context.Context), error) {
	return SubscribeToESISubject(deps, SubscriberConfig{
		Subject:      natscore.SubjectRefreshMarketPrices,
		ConsumerName: "task-scheduled-market-prices",
		StreamName:   natscore.WorkerTaskStream,
		TaskName:     "market prices refresh",
	})
}
