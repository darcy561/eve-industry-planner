package migration

import (
	"context"
	"fmt"

	"eve-industry-planner/shared/firebaseadmin"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/migration/firestoremig"
	eipnats "eve-industry-planner/shared/nats"
	esitasks "eve-industry-planner/worker/tasks/esi"

	"github.com/hibiken/asynq"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
)

// MigrateFirestoreWatchlistToMongo reads Firestore Users/{id}/ProfileInfo/Watchlist and upserts user_watchlist_deprecated.
// Remove this task type and handler with shared/migration/firestoremig and core/migration/firestoreimport when migration is done.
func MigrateFirestoreWatchlistToMongo(ctx context.Context, task *asynq.Task, deps *esitasks.TaskDependencies) error {
	if task == nil {
		return fmt.Errorf("task is nil")
	}
	if deps == nil || deps.Mongo == nil {
		return fmt.Errorf("mongo client is required")
	}

	request, err := esitasks.UnmarshalTaskPayload[eipnats.MigrateFirestoreWatchlistToMongoRequest](task)
	if err != nil {
		logs.WarnCtx(ctx, "failed to parse migrate watchlist task payload", "error", err)
		return fmt.Errorf("invalid task data: %w", err)
	}
	if request.AccountID == "" {
		return fmt.Errorf("account_id is required")
	}

	if span := trace.SpanFromContext(ctx); span.IsRecording() {
		span.SetAttributes(attribute.String("account_id", request.AccountID))
	}

	fsClient, err := firebaseadmin.GetFirestoreClient(ctx)
	if err != nil {
		return fmt.Errorf("get firestore client: %w", err)
	}
	migrated, err := firestoremig.UpsertUserWatchlistDeprecatedFromFirestore(ctx, fsClient, deps.Mongo, request.AccountID)
	if err != nil {
		return err
	}
	if !migrated {
		logs.InfoCtx(ctx, "firestore watchlist doc missing, skipping migration", "account_id", request.AccountID)
		return nil
	}
	logs.InfoCtx(ctx, "migrated firestore watchlist to MongoDB", "account_id", request.AccountID)
	return nil
}
