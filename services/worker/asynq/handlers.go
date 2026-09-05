package asynq

import (
	"context"
	"time"

	"eve-industry-planner/shared/esiclient"
	"eve-industry-planner/shared/logs"
	eipnats "eve-industry-planner/shared/nats"
	"eve-industry-planner/shared/telemetry"
	"eve-industry-planner/shared/telemetry/natsprop"
	"eve-industry-planner/shared/telemetry/workermetrics"
	"eve-industry-planner/worker/taskrun"
	"eve-industry-planner/worker/tasks/archivedjobs"
	"eve-industry-planner/worker/tasks/esi"
	"eve-industry-planner/worker/tasks/jobidentity"
	"eve-industry-planner/worker/tasks/maintenance"
	sderollbacktasks "eve-industry-planner/worker/tasks/sde/rollback"
	sdetasks "eve-industry-planner/worker/tasks/sde/update"

	"github.com/hibiken/asynq"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"
)

// SetupHandlers puts every task's handler on the mux, checked against the
// registry: a task with no handler, or a handler for no task, stops the worker
// starting rather than going unnoticed until work quietly does not happen.
func SetupHandlers(mux *asynq.ServeMux, taskDeps *taskrun.Dependencies) error {
	installTaskMiddleware(mux)

	handlers := map[string]asynq.HandlerFunc{}
	handleTrigger(handlers, eipnats.RefreshSystemIndexes, taskDeps, esi.RefreshSystemIndexes)
	handleTrigger(handlers, eipnats.RefreshAdjustedPrices, taskDeps, esi.RefreshAdjustedPrices)
	handle(handlers, eipnats.RefreshRegionMarketOrders, taskDeps, esi.RefreshRegionMarketOrders)
	handleTrigger(handlers, eipnats.CheckSDEUpdates, taskDeps, sdetasks.CheckSDEUpdates)
	handleTrigger(handlers, eipnats.RollbackSDEVersion, taskDeps, sderollbacktasks.RollbackSDEVersion)
	handle(handlers, eipnats.ApplySDEVersion, taskDeps, sdetasks.ApplySDEVersion)
	handleTrigger(handlers, eipnats.RebuildCurrentSDEVersion, taskDeps, sdetasks.RebuildCurrentSDEVersion)
	handle(handlers, eipnats.UpdateAccountSessionGrants, taskDeps, esi.RefreshAccountSessionGrants)
	handle(handlers, eipnats.DispatchStatisticsRebuilds, taskDeps, archivedjobs.DispatchStatisticsRebuilds)
	handle(handlers, eipnats.RebuildOwnerStatistics, taskDeps, archivedjobs.RebuildOwnerStatistics)
	handle(handlers, eipnats.ApplyOwnerStatisticsDelta, taskDeps, archivedjobs.ApplyOwnerStatisticsDelta)
	handleTrigger(handlers, eipnats.DispatchStatisticsReconciles, taskDeps, archivedjobs.DispatchStatisticsReconciles)
	handle(handlers, eipnats.ReconcileOwnerStatistics, taskDeps, archivedjobs.ReconcileOwnerStatistics)
	handle(handlers, eipnats.RotateRefreshTokenKeys, taskDeps, maintenance.RotateRefreshTokenKeys)
	handle(handlers, eipnats.EncodeJobIdentity, taskDeps, jobidentity.EncodeJobIdentity)
	handle(handlers, eipnats.SchemaVersionMaintenanceBatch, taskDeps, maintenance.SchemaVersionMaintenanceBatch)
	handle(handlers, eipnats.InactiveAccountPlannerCleanup, taskDeps, maintenance.InactiveAccountPlannerCleanup)
	handle(handlers, eipnats.CloudStoredEsiRefreshMaintenance, taskDeps, maintenance.CloudStoredEsiRefreshMaintenance)
	handleTrigger(handlers, eipnats.PruneExpiredAccountSessions, taskDeps, maintenance.PruneExpiredAccountSessions)

	return mount(mux, handlers)
}

// installTaskMiddleware wraps every handler with the context, span and outcome
// reporting a task runs under, so a handler opens none of it for itself.
func installTaskMiddleware(mux *asynq.ServeMux) {
	// A handler passes this ctx to its own publishes and queries, which is what
	// keeps child work on the trace the task arrived on.
	tracer := telemetry.Tracer("worker")
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
			err := terminalAsSkipRetry(h.ProcessTask(ctx, t))
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
			case esiclient.IsRateLimit(err):
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
}

func emitAsynqTaskLog(ctx context.Context, level, msg string, detail map[string]any) {
	steps := logs.DebugStepsFromContext(ctx)
	caveats := logs.HandlerCaveatsFromContext(ctx)
	logs.EmitAccessShapedLog(ctx, level, msg, detail, steps, caveats)
}
