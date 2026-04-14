package migration

import (
	"context"
	"fmt"
	"time"

	"eve-industry-planner/shared/core/firebaseuserdoc"
	mongocore "eve-industry-planner/shared/core/mongo"
	natscore "eve-industry-planner/shared/core/nats"
	"eve-industry-planner/shared/firebaseadmin"
	"eve-industry-planner/shared/logs"
	esitasks "eve-industry-planner/worker/tasks/esi"

	"github.com/hibiken/asynq"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"

	"firebase.google.com/go/v4/auth"
)

const firestoreUsersCollection = "Users"

// MigrateUserDocumentToMongo converts a Firebase user document to the new MongoDB format (account doc + application settings)
// and upserts both documents. Runs with lowest priority (priority_5).
func MigrateUserDocumentToMongo(ctx context.Context, task *asynq.Task, deps *esitasks.TaskDependencies) error {
	if task == nil {
		return fmt.Errorf("task is nil")
	}
	if deps == nil || deps.ServiceClients == nil || deps.Mongo == nil {
		return fmt.Errorf("mongo client is required")
	}

	request, err := esitasks.UnmarshalTaskPayload[natscore.MigrateUserDocumentToMongoRequest](task)
	if err != nil {
		logs.WarnCtx(ctx, "failed to parse migrate user document task payload", "error", err)
		return fmt.Errorf("invalid task data: %w", err)
	}

	if request.AccountID == "" {
		return fmt.Errorf("account_id is required")
	}

	if span := trace.SpanFromContext(ctx); span.IsRecording() {
		span.SetAttributes(attribute.String("account_id", request.AccountID))
	}

	client := deps.Mongo
	db := client.Database(mongocore.DatabaseName)
	usersCol := db.Collection(mongocore.CollectionUsers)
	settingsCol := db.Collection(mongocore.CollectionApplicationSettings)

	userDocExists, err := mongocore.DocumentExistsByID(ctx, usersCol, request.AccountID, request.AccountID)
	if err != nil {
		return fmt.Errorf("check existing user account document: %w", err)
	}
	settingsDocExists, err := mongocore.DocumentExistsByID(ctx, settingsCol, request.AccountID, request.AccountID)
	if err != nil {
		return fmt.Errorf("check existing application settings document: %w", err)
	}
	if userDocExists && settingsDocExists {
		logs.InfoCtx(ctx, "migration skipped, mongo documents already exist", "account_id", request.AccountID)
		return nil
	}

	logs.InfoCtx(ctx, "migrate user document task started", "account_id", request.AccountID)

	// Ensure user exists in Firebase Auth; exit early if not (nothing to migrate)
	authClient, err := firebaseadmin.GetAuthClient(ctx)
	if err != nil {
		return fmt.Errorf("get firebase auth client: %w", err)
	}
	userRecord, err := authClient.GetUser(ctx, request.AccountID)
	if err != nil {
		if auth.IsUserNotFound(err) {
			logs.InfoCtx(ctx, "user not found in Firebase Auth, skipping migration", "account_id", request.AccountID)
			return nil // success, nothing to migrate
		}
		return fmt.Errorf("get firebase auth user: %w", err)
	}

	// Use Auth metadata for created/last-login; fallback to now if missing or zero
	var createdAt, lastLoginAt time.Time
	if userRecord.UserMetadata != nil {
		if userRecord.UserMetadata.CreationTimestamp > 0 {
			createdAt = time.Unix(0, userRecord.UserMetadata.CreationTimestamp*int64(time.Millisecond)).UTC()
		}
		if userRecord.UserMetadata.LastLogInTimestamp > 0 {
			lastLoginAt = time.Unix(0, userRecord.UserMetadata.LastLogInTimestamp*int64(time.Millisecond)).UTC()
		}
	}
	now := time.Now()
	if createdAt.IsZero() {
		createdAt = now
	}
	if lastLoginAt.IsZero() {
		lastLoginAt = createdAt
	}

	// Fetch user document from Firestore
	fsClient, err := firebaseadmin.GetFirestoreClient(ctx)
	if err != nil {
		return fmt.Errorf("get firestore client: %w", err)
	}
	snap, err := fsClient.Collection(firestoreUsersCollection).Doc(request.AccountID).Get(ctx)
	if err != nil {
		return fmt.Errorf("get user document from firestore: %w", err)
	}
	if !snap.Exists() {
		return fmt.Errorf("firestore user document not found for account_id %s", request.AccountID)
	}
	firebaseDoc := snap.Data()
	logs.DebugCtx(ctx, "fetched user document from Firestore", "account_id", request.AccountID, "fields", len(firebaseDoc))

	fb, err := firebaseuserdoc.ParseUserDoc(firebaseDoc)
	if err != nil {
		return fmt.Errorf("parse firebase doc: %w", err)
	}
	if fb == nil {
		return fmt.Errorf("firebase user document empty for account_id %s", request.AccountID)
	}

	accountDoc := firebaseuserdoc.MapUserAccountForImport(fb, request.AccountID, createdAt, lastLoginAt)
	settingsDoc := firebaseuserdoc.MapApplicationSettings(fb, request.AccountID)

	// Upsert account document
	_, err = mongocore.UpsertStructByIDWithMeta(ctx, usersCol, accountDoc, request.AccountID)
	if err != nil {
		return fmt.Errorf("upsert user account document: %w", err)
	}

	// Upsert application settings document
	settingsResult, err := mongocore.UpsertStructByIDWithMeta(ctx, settingsCol, settingsDoc, request.AccountID)
	if err != nil {
		return fmt.Errorf("upsert application settings document: %w", err)
	}
	logs.DebugCtx(ctx, "upserted application settings document",
		"account_id", request.AccountID,
		"matched", settingsResult.MatchedCount,
		"modified", settingsResult.ModifiedCount,
		"upserted", settingsResult.UpsertedCount)

	logs.InfoCtx(ctx, "migrated user document to MongoDB",
		"account_id", request.AccountID)
	return nil
}
