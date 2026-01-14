package asynq

import (
	"context"

	"eve-industry-planner/shared/shared"
	esiratelimiter "eve-industry-planner/worker/ratelimiter"
	esitasks "eve-industry-planner/worker/tasks/esi"

	"github.com/hibiken/asynq"
)

// WorkerDependencies holds dependencies needed by task handlers
type WorkerDependencies interface {
	GetServiceClients() *shared.ServiceClients
	GetESIClient() esiratelimiter.ClientInterface
}

// SetupESIHandlers registers ESI task handlers on the given mux
func SetupESIHandlers(mux *asynq.ServeMux, deps WorkerDependencies) {
	// Create task dependencies once
	taskDeps := &esitasks.TaskDependencies{
		ServiceClients: deps.GetServiceClients(),
		ESIClient:      deps.GetESIClient(),
	}

	// Register ESI task handlers
	// These are tasks that interact with the EVE Online ESI API
	mux.HandleFunc("refreshSystemIndexes", func(ctx context.Context, t *asynq.Task) error {
		return esitasks.RefreshSystemIndexes(ctx, t, taskDeps)
	})

	mux.HandleFunc("refreshAdjustedPrices", func(ctx context.Context, t *asynq.Task) error {
		return esitasks.RefreshAdjustedPrices(ctx, t, taskDeps)
	})

	mux.HandleFunc("refreshMarketPrices", func(ctx context.Context, t *asynq.Task) error {
		return esitasks.RefreshMarketPrices(ctx, t, taskDeps)
	})

	mux.HandleFunc("fetchCorporations", func(ctx context.Context, t *asynq.Task) error {
		return esitasks.UpdateCustomCorporationClaims(ctx, t, taskDeps)
	})
}

// SetupRegularHandlers registers regular task handlers on the given mux
func SetupRegularHandlers(mux *asynq.ServeMux, deps WorkerDependencies) {
	// Register regular task handlers
	// These are tasks that don't interact with ESI API
	// (No regular tasks currently - all tasks use ESI rate limiter)

	// Add more regular task handlers here as needed
	// When adding handlers, create taskDeps like in SetupESIHandlers:
	// taskDeps := &esitasks.TaskDependencies{
	//     ServiceClients: deps.GetServiceClients(),
	//     ESIClient:      deps.GetESIClient(),
	// }
}
