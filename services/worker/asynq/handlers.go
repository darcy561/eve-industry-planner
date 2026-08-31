package asynq

import (
	"context"
	eipnats "eve-industry-planner/shared/nats"
	"eve-industry-planner/shared/stackservices"
	"time"

	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/telemetry/natsprop"
	"eve-industry-planner/shared/telemetry/workermetrics"
	esiratelimiter "eve-industry-planner/worker/ratelimiter"
	archivedjobtasks "eve-industry-planner/worker/tasks/archivedjobs"
	esitasks "eve-industry-planner/worker/tasks/esi"
	jobidentitytasks "eve-industry-planner/worker/tasks/jobidentity"
	maintenancetasks "eve-industry-planner/worker/tasks/maintenance"
	migrationtasks "eve-industry-planner/worker/tasks/migration"
	sderollbacktasks "eve-industry-planner/worker/tasks/sde/rollback"
	sdetasks "eve-industry-planner/worker/tasks/sde/update"

	"eve-industry-planner/shared/crypto/entityid"
	"github.com/hibiken/asynq"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"
)

// WorkerDependencies holds dependencies needed by task handlers
type WorkerDependencies interface {
	GetClients() *stackservices.Clients
	GetESIClient() esiratelimiter.ClientInterface
	GetEntityCipher() *entityid.Cipher
}

// SetupHandlers registers all task handlers (both ESI and regular) on the given mux
func SetupHandlers(mux *asynq.ServeMux, deps WorkerDependencies) {
	// Restore trace from NATS/asynq headers, start a span for this task; record OTel metrics only on success or real failure (not rate-limit re-queues).
	// Handlers should pass ctx to NATS PublishTask / DB calls so child work stays on the same trace.
	tracer := otel.Tracer("eve-industry-planner/worker")
	mux.Use(func(h asynq.Handler) asynq.Handler {
		return asynq.HandlerFunc(func(ctx context.Context, t *asynq.Task) error {
			ctx = natsprop.ExtractFromStringMap(ctx, t.Headers())
			ctx = natsprop.BindLogContextFromStringMap(ctx, t.Headers())
			ctx = logs.BeginOperationContext(ctx)
			ctx = logs.EnsureOperationLogger(ctx)
			taskType := t.Type()
			ctx, span := tracer.Start(ctx, "asynq.task",
				trace.WithAttributes(attribute.String("asynq.task.type", taskType)),
			)
			logs.AttachDebugStepCtx(ctx, "asynq_task_started", map[string]any{
				"task_type": taskType,
			})
			start := time.Now()
			err := h.ProcessTask(ctx, t)
			elapsed := time.Since(start)
			outcomeDetail := map[string]any{
				"task_type":   taskType,
				"duration_ms": elapsed.Milliseconds(),
			}
			if rid := logs.RequestIDFromContext(ctx); rid != "" {
				outcomeDetail["request_id"] = rid
			}
			switch {
			case err == nil:
				span.SetStatus(codes.Ok, "")
				workermetrics.RecordAsynqTask(ctx, taskType, "success", elapsed)
				logs.AttachDebugStepCtx(ctx, "asynq_task_completed", outcomeDetail)
				emitAsynqTaskLog(ctx, "debug", "asynq task completed", outcomeDetail)
			case errIsRateLimitDeferral(err):
				// Matches asynq.Config.IsFailure: task is re-queued for later; do not count in metrics
				// (these bounce until they eventually succeed or fail for real).
				span.SetAttributes(attribute.String("asynq.task.outcome", "retry_rate_limit"))
				span.SetStatus(codes.Ok, "")
				outcomeDetail["outcome"] = "retry_rate_limit"
				logs.AttachDebugStepCtx(ctx, "asynq_task_deferred", outcomeDetail)
				emitAsynqTaskLog(ctx, "debug", "asynq task deferred (rate limit)", outcomeDetail)
			default:
				span.RecordError(err)
				span.SetStatus(codes.Error, err.Error())
				workermetrics.RecordAsynqTask(ctx, taskType, "failure", elapsed)
				outcomeDetail["error"] = err.Error()
				logs.AttachDebugStepCtx(ctx, "asynq_task_failed", outcomeDetail)
				emitAsynqTaskLog(ctx, "warn", "asynq task failed", outcomeDetail)
			}
			span.End()
			return err
		})
	})

	// Create task dependencies once
	taskDeps := esitasks.FromClients(deps.GetClients(), deps.GetESIClient(), deps.GetEntityCipher())

	// Register task handlers
	handle(mux, eipnats.RefreshSystemIndexes, func(ctx context.Context, t *asynq.Task) error {
		return esitasks.RefreshSystemIndexes(ctx, t, taskDeps)
	})

	handle(mux, eipnats.RefreshAdjustedPrices, func(ctx context.Context, t *asynq.Task) error {
		return esitasks.RefreshAdjustedPrices(ctx, t, taskDeps)
	})

	handle(mux, eipnats.RefreshRegionMarketOrders, func(ctx context.Context, t *asynq.Task) error {
		return esitasks.RefreshRegionMarketOrders(ctx, t, taskDeps)
	})

	handle(mux, eipnats.CheckSDEUpdates, func(ctx context.Context, t *asynq.Task) error {
		return sdetasks.CheckSDEUpdates(ctx, t, taskDeps)
	})
	handle(mux, eipnats.RollbackSDEVersion, func(ctx context.Context, t *asynq.Task) error {
		return sderollbacktasks.RollbackSDEVersion(ctx, t, taskDeps)
	})
	handle(mux, eipnats.ApplySDEVersion, func(ctx context.Context, t *asynq.Task) error {
		return sdetasks.ApplySDEVersion(ctx, t, taskDeps)
	})
	handle(mux, eipnats.RebuildCurrentSDEVersion, func(ctx context.Context, t *asynq.Task) error {
		return sdetasks.RebuildCurrentSDEVersion(ctx, t, taskDeps)
	})

	handle(mux, eipnats.UpdateAccountSessionGrants, func(ctx context.Context, t *asynq.Task) error {
		return esitasks.RefreshAccountSessionGrants(ctx, t, taskDeps)
	})

	handle(mux, eipnats.MigrateUserDocumentToMongo, func(ctx context.Context, t *asynq.Task) error {
		return migrationtasks.MigrateUserDocumentToMongo(ctx, t, taskDeps)
	})

	handle(mux, eipnats.EncryptCloudRefreshTokensBatch, func(ctx context.Context, t *asynq.Task) error {
		return migrationtasks.EncryptCloudRefreshTokensBatch(ctx, t, taskDeps)
	})
	handle(mux, eipnats.MigrateUserCloudAccountsToUserDoc, func(ctx context.Context, t *asynq.Task) error {
		return migrationtasks.MigrateUserCloudAccountsToUserDoc(ctx, t, taskDeps)
	})

	handle(mux, eipnats.MigrateFirestoreWatchlistToMongo, func(ctx context.Context, t *asynq.Task) error {
		return migrationtasks.MigrateFirestoreWatchlistToMongo(ctx, t, taskDeps)
	})

	handle(mux, eipnats.ImportArchivedJobToMongo, func(ctx context.Context, t *asynq.Task) error {
		return migrationtasks.ImportArchivedJobToMongo(ctx, t, taskDeps)
	})

	handle(mux, eipnats.ImportUserJobDocumentsForAccount, func(ctx context.Context, t *asynq.Task) error {
		return migrationtasks.ImportUserJobDocumentsForAccount(ctx, t, taskDeps)
	})

	handle(mux, eipnats.DrainAccountStatsRebuildQueue, func(ctx context.Context, t *asynq.Task) error {
		return archivedjobtasks.DrainAccountStatsRebuildQueue(ctx, t, taskDeps)
	})
	handle(mux, eipnats.RotateRefreshTokenKeys, func(ctx context.Context, t *asynq.Task) error {
		return maintenancetasks.RotateRefreshTokenKeys(ctx, t, taskDeps)
	})
	handle(mux, eipnats.EncodeJobIdentity, func(ctx context.Context, t *asynq.Task) error {
		return jobidentitytasks.EncodeJobIdentity(ctx, t, taskDeps)
	})
	handle(mux, eipnats.SchemaVersionMaintenanceBatch, func(ctx context.Context, t *asynq.Task) error {
		return maintenancetasks.SchemaVersionMaintenanceBatch(ctx, t, taskDeps)
	})
	handle(mux, eipnats.InactiveAccountPlannerCleanup, func(ctx context.Context, t *asynq.Task) error {
		return maintenancetasks.InactiveAccountPlannerCleanup(ctx, t, taskDeps)
	})
	handle(mux, eipnats.CloudStoredEsiRefreshMaintenance, func(ctx context.Context, t *asynq.Task) error {
		return maintenancetasks.CloudStoredEsiRefreshMaintenance(ctx, t, taskDeps)
	})
	handle(mux, eipnats.PruneExpiredAccountSessions, func(ctx context.Context, t *asynq.Task) error {
		return maintenancetasks.PruneExpiredAccountSessions(ctx, t, taskDeps)
	})
}

func emitAsynqTaskLog(ctx context.Context, level, msg string, detail map[string]any) {
	steps := logs.DebugStepsFromContext(ctx)
	caveats := logs.HandlerCaveatsFromContext(ctx)
	logs.EmitAccessShapedLog(ctx, level, msg, detail, steps, caveats)
}
