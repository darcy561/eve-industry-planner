package asynq

import (
	"context"
	"time"

	natscore "eve-industry-planner/shared/core/nats"
	"eve-industry-planner/shared/shared"
	"eve-industry-planner/shared/telemetry/natsprop"
	"eve-industry-planner/shared/telemetry/workermetrics"
	esiratelimiter "eve-industry-planner/worker/ratelimiter"
	esitasks "eve-industry-planner/worker/tasks/esi"
	migrationtasks "eve-industry-planner/worker/tasks/migration"
	sderollbacktasks "eve-industry-planner/worker/tasks/sde/rollback"
	sdetasks "eve-industry-planner/worker/tasks/sde/update"

	"github.com/hibiken/asynq"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"
)

// WorkerDependencies holds dependencies needed by task handlers
type WorkerDependencies interface {
	GetServiceClients() *shared.ServiceClients
	GetESIClient() esiratelimiter.ClientInterface
}

// SetupHandlers registers all task handlers (both ESI and regular) on the given mux
func SetupHandlers(mux *asynq.ServeMux, deps WorkerDependencies) {
	// Restore trace from NATS/asynq headers, start a span for this task; record OTel metrics only on success or real failure (not rate-limit re-queues).
	// Handlers should pass ctx to NATS PublishTask / DB calls so child work stays on the same trace.
	tracer := otel.Tracer("eve-industry-planner/worker")
	mux.Use(func(h asynq.Handler) asynq.Handler {
		return asynq.HandlerFunc(func(ctx context.Context, t *asynq.Task) error {
			ctx = natsprop.ExtractFromStringMap(ctx, t.Headers())
			taskType := t.Type()
			ctx, span := tracer.Start(ctx, "asynq.task",
				trace.WithAttributes(attribute.String("asynq.task.type", taskType)),
			)
			if attrs := natscore.AsynqTaskPayloadSpanAttributes(taskType, t.Payload()); len(attrs) > 0 {
				span.SetAttributes(attrs...)
			}
			start := time.Now()
			err := h.ProcessTask(ctx, t)
			elapsed := time.Since(start)
			switch {
			case err == nil:
				span.SetStatus(codes.Ok, "")
				workermetrics.RecordAsynqTask(ctx, taskType, "success", elapsed)
			case errIsRateLimitDeferral(err):
				// Matches asynq.Config.IsFailure: task is re-queued for later; do not count in metrics
				// (these bounce until they eventually succeed or fail for real).
				span.SetAttributes(attribute.String("asynq.task.outcome", "retry_rate_limit"))
				span.SetStatus(codes.Ok, "")
			default:
				span.RecordError(err)
				span.SetStatus(codes.Error, err.Error())
				workermetrics.RecordAsynqTask(ctx, taskType, "failure", elapsed)
			}
			span.End()
			return err
		})
	})

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
	mux.HandleFunc("rebuildCurrentSDEVersion", func(ctx context.Context, t *asynq.Task) error {
		return sdetasks.RebuildCurrentSDEVersion(ctx, t, taskDeps)
	})

	mux.HandleFunc("fetchCorporations", func(ctx context.Context, t *asynq.Task) error {
		return esitasks.UpdateCustomCorporationClaims(ctx, t, taskDeps)
	})

	mux.HandleFunc("migrateUserDocumentToMongo", func(ctx context.Context, t *asynq.Task) error {
		return migrationtasks.MigrateUserDocumentToMongo(ctx, t, taskDeps)
	})
}
