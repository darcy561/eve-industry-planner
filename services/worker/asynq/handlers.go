package asynq

import (
	"context"

	"eve-industry-planner/shared/shared"
	esiratelimiter "eve-industry-planner/worker/ratelimiter"
	esitasks "eve-industry-planner/worker/tasks/esi"
	migrationtasks "eve-industry-planner/worker/tasks/migration"
	sderollbacktasks "eve-industry-planner/worker/tasks/sde/rollback"
	sdetasks "eve-industry-planner/worker/tasks/sde/update"

	"github.com/hibiken/asynq"
)

// WorkerDependencies holds dependencies needed by task handlers
type WorkerDependencies interface {
	GetServiceClients() *shared.ServiceClients
	GetESIClient() esiratelimiter.ClientInterface
}

// SetupHandlers registers all task handlers (both ESI and regular) on the given mux
func SetupHandlers(mux *asynq.ServeMux, deps WorkerDependencies) {
	// Create task dependencies once
	taskDeps := &esitasks.TaskDependencies{
		ServiceClients: deps.GetServiceClients(),
		ESIClient:      deps.GetESIClient(),
	}

	// Register task handlers
	mux.HandleFunc("refreshSystemIndexes", func(ctx context.Context, t *asynq.Task) error {
		return esitasks.RefreshSystemIndexes(ctx, t, taskDeps)
	})

	mux.HandleFunc("refreshAdjustedPrices", func(ctx context.Context, t *asynq.Task) error {
		return esitasks.RefreshAdjustedPrices(ctx, t, taskDeps)
	})

	mux.HandleFunc("refreshMarketPrices", func(ctx context.Context, t *asynq.Task) error {
		return esitasks.RefreshMarketPrices(ctx, t, taskDeps)
	})
	mux.HandleFunc("fetchMissingMarketPrices", func(ctx context.Context, t *asynq.Task) error {
		return esitasks.RefreshMarketPrices(ctx, t, taskDeps)
	})

	mux.HandleFunc("countMarketPricesItems", func(ctx context.Context, t *asynq.Task) error {
		return esitasks.CountMarketPricesItems(ctx, t, taskDeps)
	})

	mux.HandleFunc("checkSDEUpdates", func(ctx context.Context, t *asynq.Task) error {
		return sdetasks.CheckSDEUpdates(ctx, t, taskDeps)
	})
	mux.HandleFunc("rollbackSDEVersion", func(ctx context.Context, t *asynq.Task) error {
		return sderollbacktasks.RollbackSDEVersion(ctx, t, taskDeps)
	})
	mux.HandleFunc("applySDEVersion", func(ctx context.Context, t *asynq.Task) error {
		return sdetasks.ApplySDEVersion(ctx, t, taskDeps)
	})

	mux.HandleFunc("fetchCorporations", func(ctx context.Context, t *asynq.Task) error {
		return esitasks.UpdateCustomCorporationClaims(ctx, t, taskDeps)
	})

	mux.HandleFunc("migrateUserDocumentToMongo", func(ctx context.Context, t *asynq.Task) error {
		return migrationtasks.MigrateUserDocumentToMongo(ctx, t, taskDeps)
	})
}
