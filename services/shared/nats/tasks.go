package nats

import (
	"context"
	"encoding/json"
	"time"
)

// DefaultWorkerTaskTimeout is used when a task type has no DefaultTimeout set or is unknown.
var DefaultWorkerTaskTimeout = 60 * time.Second

// Priority queue names for task routing. Use with Publish to override a task's default.
const (
	Priority1 = "priority_1" // Reserved for future critical tasks
	Priority2 = "priority_2" // Urgent, user-impacting
	Priority3 = "priority_3" // Default, steady throughput
	Priority4 = "priority_4" // High-volume background
	Priority5 = "priority_5" // Reserved / bulk tasks (lowest)
)

// Task definitions — single source of truth for name, subject, default priority, and timeout.
var (
	MigrateUserDocumentToMongo = defineTask(Definition{
		Name:            "migrateUserDocumentToMongo",
		Subject:         "task.migration.migrateUserDocumentToMongo",
		DefaultPriority: Priority5,
		DefaultTimeout:  5 * time.Minute,
	})
	MigrateFirestoreWatchlistToMongo = defineTask(Definition{
		Name:            "migrateFirestoreWatchlistToMongo",
		Subject:         "task.migration.migrateFirestoreWatchlistToMongo",
		DefaultPriority: Priority5,
		DefaultTimeout:  2 * time.Minute,
	})
	// ImportArchivedJobToMongo normalises one Firestore ArchivedJobs document and upserts [models.Job] into MongoDB archivedJobs.
	ImportArchivedJobToMongo = defineTask(Definition{
		Name:            "importArchivedJobToMongo",
		Subject:         "task.migration.importArchivedJobToMongo",
		DefaultPriority: Priority5,
		DefaultTimeout:  3 * time.Minute,
	})
	// ImportUserJobDocumentsForAccount copies referenced live Firestore job docs to Mongo user_job_documents (one account per task).
	ImportUserJobDocumentsForAccount = defineTask(Definition{
		Name:            "importUserJobDocumentsForAccount",
		Subject:         "task.migration.importUserJobDocumentsForAccount",
		DefaultPriority: Priority5,
		DefaultTimeout:  15 * time.Minute,
	})
	EncryptCloudRefreshTokensBatch = defineTask(Definition{
		Name:            "encryptCloudRefreshTokensBatch",
		Subject:         "task.migration.encryptCloudRefreshTokensBatch",
		DefaultPriority: Priority5,
		DefaultTimeout:  15 * time.Minute,
	})
	MigrateUserCloudAccountsToUserDoc = defineTask(Definition{
		Name:            "migrateUserCloudAccountsToUserDoc",
		Subject:         "task.migration.migrateUserCloudAccountsToUserDoc",
		DefaultPriority: Priority5,
		DefaultTimeout:  10 * time.Minute,
	})
	// DrainAccountStatsRebuildQueue rebuilds every account waiting in the statistics
	// rebuild queue (worker: tasks/archivedjobs). One pass handles the whole queue
	// rather than fanning out per account: the claim protocol that keeps a mid-rebuild
	// re-queue from being cleared lives in the drain, and splitting it per account
	// would move that logic into a path the queue's semantics are not tested against.
	DrainAccountStatsRebuildQueue = defineTask(Definition{
		Name:            "drainAccountStatsRebuildQueue",
		Subject:         "task.scheduled.drainAccountStatsRebuildQueue",
		DefaultPriority: Priority4,
		DefaultTimeout:  15 * time.Minute,
	})
	RefreshSystemIndexes = defineTask(Definition{
		Name:            "refreshSystemIndexes",
		Subject:         "task.scheduled.refreshSystemIndexes",
		DefaultPriority: Priority3,
		DefaultTimeout:  60 * time.Second,
	})
	RefreshAdjustedPrices = defineTask(Definition{
		Name:            "refreshAdjustedPrices",
		Subject:         "task.scheduled.refreshAdjustedPrices",
		DefaultPriority: Priority3,
		DefaultTimeout:  60 * time.Second,
	})
	RefreshRegionMarketOrders = defineTask(Definition{
		Name:            "refreshRegionMarketOrders",
		Subject:         "task.scheduled.refreshRegionMarketOrders",
		DefaultPriority: Priority4,
		DefaultTimeout:  30 * time.Minute,
	})
	UpdateAccountSessionGrants = defineTask(Definition{
		Name:            "updateAccountSessionGrants",
		Subject:         "task.auth.updateAccountSessionGrants",
		DefaultPriority: Priority3,
		DefaultTimeout:  60 * time.Second,
	})
	CheckSDEUpdates = defineTask(Definition{
		Name:            "checkSDEUpdates",
		Subject:         "task.scheduled.checkSDEUpdates",
		DefaultPriority: Priority5,
		DefaultTimeout:  15 * time.Minute,
	})
	RollbackSDEVersion = defineTask(Definition{
		Name:            "rollbackSDEVersion",
		Subject:         "task.scheduled.rollbackSDEVersion",
		DefaultPriority: Priority5,
		DefaultTimeout:  15 * time.Minute,
	})
	ApplySDEVersion = defineTask(Definition{
		Name:            "applySDEVersion",
		Subject:         "task.scheduled.applySDEVersion",
		DefaultPriority: Priority5,
		DefaultTimeout:  15 * time.Minute,
	})
	RebuildCurrentSDEVersion = defineTask(Definition{
		Name:            "rebuildCurrentSDEVersion",
		Subject:         "task.scheduled.rebuildCurrentSDEVersion",
		DefaultPriority: Priority5,
		DefaultTimeout:  15 * time.Minute,
	})
	RotateRefreshTokenKeys = defineTask(Definition{
		Name:            "rotateRefreshTokenKeys",
		Subject:         "task.maintenance.rotateRefreshTokenKeys",
		DefaultPriority: Priority5,
		DefaultTimeout:  20 * time.Minute,
	})

	// EncodeJobIdentity converts the entity ids one account's job documents still
	// hold in the clear into refs, and brings documents written under an older
	// field set onto the current one.
	EncodeJobIdentity = defineTask(Definition{
		Name:            "encodeJobIdentity",
		Subject:         "task.maintenance.encodeJobIdentity",
		DefaultPriority: Priority5,
		DefaultTimeout:  20 * time.Minute,
	})
	SchemaVersionMaintenanceBatch = defineTask(Definition{
		Name:            "schemaVersionMaintenanceBatch",
		Subject:         "task.maintenance.schemaVersionMaintenanceBatch",
		DefaultPriority: Priority5,
		DefaultTimeout:  3 * time.Minute,
	})
	InactiveAccountPlannerCleanup = defineTask(Definition{
		Name:            "inactiveAccountPlannerCleanup",
		Subject:         "task.maintenance.inactiveAccountPlannerCleanup",
		DefaultPriority: Priority5,
		DefaultTimeout:  5 * time.Minute,
	})
	CloudStoredEsiRefreshMaintenance = defineTask(Definition{
		Name:            "cloudStoredEsiRefreshMaintenance",
		Subject:         "task.maintenance.cloudStoredEsiRefreshMaintenance",
		DefaultPriority: Priority5,
		DefaultTimeout:  10 * time.Minute,
	})
	PruneExpiredAccountSessions = defineTask(Definition{
		Name:            "pruneExpiredAccountSessions",
		Subject:         "task.maintenance.pruneExpiredAccountSessions",
		DefaultPriority: Priority5,
		DefaultTimeout:  5 * time.Minute,
	})
)

// Publish helpers. One per task, taking the fields that task needs, so a caller
// names what it is asking for rather than assembling a payload first. A zero
// value means the worker's default, exactly as the omitted JSON field does.

// PublishMigrateUserDocumentToMongo copies one account's Firestore user document into Mongo.
func PublishMigrateUserDocumentToMongo(ctx context.Context, n *NATS, accountID string) error {
	return publish(ctx, n, MigrateUserDocumentToMongo, MigrateUserDocumentToMongoRequest{AccountID: accountID})
}

// PublishImportArchivedJobToMongo normalises one Firestore archived-job document into Mongo.
func PublishImportArchivedJobToMongo(ctx context.Context, n *NATS, userID, firestorePath, firestoreDocumentID string, rawData json.RawMessage, canonicalBuildVer string) error {
	return publish(ctx, n, ImportArchivedJobToMongo, ImportArchivedJobToMongoRequest{
		UserID:              userID,
		FirestorePath:       firestorePath,
		FirestoreDocumentID: firestoreDocumentID,
		RawData:             rawData,
		CanonicalBuildVer:   canonicalBuildVer,
	})
}

// PublishImportUserJobDocumentsForAccount copies one account's referenced job documents into Mongo.
// A zero recency window applies the server default; -1 skips the login check.
func PublishImportUserJobDocumentsForAccount(ctx context.Context, n *NATS, accountID string, loginRecencyMaxAgeSeconds int64) error {
	return publish(ctx, n, ImportUserJobDocumentsForAccount, ImportUserJobDocumentsForAccountRequest{
		AccountID:                 accountID,
		LoginRecencyMaxAgeSeconds: loginRecencyMaxAgeSeconds,
	})
}

// PublishEncryptCloudRefreshTokensBatch encrypts one account's stored refresh tokens.
func PublishEncryptCloudRefreshTokensBatch(ctx context.Context, n *NATS, accountID string, dryRun bool) error {
	return publish(ctx, n, EncryptCloudRefreshTokensBatch, EncryptCloudRefreshTokensRequest{AccountID: accountID, DryRun: dryRun})
}

// PublishMigrateUserCloudAccountsToUserDoc moves one account's cloud accounts onto its user document.
func PublishMigrateUserCloudAccountsToUserDoc(ctx context.Context, n *NATS, accountID string, dryRun bool) error {
	return publish(ctx, n, MigrateUserCloudAccountsToUserDoc, MigrateUserCloudAccountsToUserDocRequest{AccountID: accountID, DryRun: dryRun})
}

// PublishDrainAccountStatsRebuildQueue asks the worker to rebuild every account waiting in the queue.
func PublishDrainAccountStatsRebuildQueue(ctx context.Context, n *NATS) error {
	return publish(ctx, n, DrainAccountStatsRebuildQueue, struct{}{})
}

// TriggerRefreshSystemIndexes asks the worker to refresh industry system indexes.
func TriggerRefreshSystemIndexes(ctx context.Context, n *NATS) error {
	return trigger(ctx, n, RefreshSystemIndexes)
}

// TriggerRefreshAdjustedPrices asks the worker to refresh adjusted prices.
func TriggerRefreshAdjustedPrices(ctx context.Context, n *NATS) error {
	return trigger(ctx, n, RefreshAdjustedPrices)
}

// PublishRefreshRegionMarketOrders asks the worker to refresh one region's order book.
func PublishRefreshRegionMarketOrders(ctx context.Context, n *NATS, regionID int32, stationID int64) error {
	return publish(ctx, n, RefreshRegionMarketOrders, RegionMarketOrdersRequest{RegionID: regionID, StationID: stationID})
}

// PublishUpdateAccountSessionGrants resolves corporation and alliance grants from EVE SSO tokens.
func PublishUpdateAccountSessionGrants(ctx context.Context, n *NATS, accountID string, tokens []string) error {
	return publish(ctx, n, UpdateAccountSessionGrants, AccountSessionGrantsRequest{AccountID: accountID, Tokens: tokens})
}

// TriggerCheckSDEUpdates asks the worker to check for a new Static Data Export.
func TriggerCheckSDEUpdates(ctx context.Context, n *NATS) error {
	return trigger(ctx, n, CheckSDEUpdates)
}

// PublishRotateRefreshTokenKeys re-encrypts one account's refresh tokens onto the current key.
func PublishRotateRefreshTokenKeys(ctx context.Context, n *NATS, accountID, fromVersion string, dryRun bool) error {
	return publish(ctx, n, RotateRefreshTokenKeys, RotateRefreshTokenKeysRequest{
		AccountID:   accountID,
		FromVersion: fromVersion,
		DryRun:      dryRun,
	})
}

// PublishEncodeJobIdentity converts one account's entity ids to refs in a collection.
func PublishEncodeJobIdentity(ctx context.Context, n *NATS, accountID, collection string, dryRun bool) error {
	return publish(ctx, n, EncodeJobIdentity, EncodeJobIdentityRequest{
		AccountID:  accountID,
		Collection: collection,
		DryRun:     dryRun,
	})
}

// PublishSchemaVersionMaintenanceBatch upgrades one batch of documents in a collection.
func PublishSchemaVersionMaintenanceBatch(ctx context.Context, n *NATS, collection string, batchSize int) error {
	return publish(ctx, n, SchemaVersionMaintenanceBatch, SchemaVersionMaintenanceBatchRequest{
		Collection: collection,
		BatchSize:  batchSize,
	})
}

// PublishInactiveAccountPlannerCleanup removes planner jobs and groups for one inactive account.
func PublishInactiveAccountPlannerCleanup(ctx context.Context, n *NATS, accountID string, staleAgeYears int) error {
	return publish(ctx, n, InactiveAccountPlannerCleanup, InactiveAccountPlannerCleanupRequest{
		AccountID:     accountID,
		StaleAgeYears: staleAgeYears,
	})
}

// PublishCloudStoredEsiRefreshMaintenance rotates one account's stored ESI refresh tokens.
func PublishCloudStoredEsiRefreshMaintenance(ctx context.Context, n *NATS, accountID string, rotateAfterLoginDays, abandonAfterLoginMonths int) error {
	return publish(ctx, n, CloudStoredEsiRefreshMaintenance, CloudStoredEsiRefreshMaintenanceRequest{
		AccountID:               accountID,
		RotateAfterLoginDays:    rotateAfterLoginDays,
		AbandonAfterLoginMonths: abandonAfterLoginMonths,
	})
}

// TriggerPruneExpiredAccountSessions asks the worker to prune expired account sessions.
func TriggerPruneExpiredAccountSessions(ctx context.Context, n *NATS) error {
	return trigger(ctx, n, PruneExpiredAccountSessions)
}

// PublishMigrateFirestoreWatchlistToMongo copies one account's Firestore watchlist into Mongo.
func PublishMigrateFirestoreWatchlistToMongo(ctx context.Context, n *NATS, accountID string) error {
	return publish(ctx, n, MigrateFirestoreWatchlistToMongo, MigrateFirestoreWatchlistToMongoRequest{AccountID: accountID})
}

// PublishRollbackSDEVersion rolls the live Static Data Export back to a build.
func PublishRollbackSDEVersion(ctx context.Context, n *NATS, buildNumber int) error {
	return publish(ctx, n, RollbackSDEVersion, SDEApplyVersionRequest{BuildNumber: buildNumber})
}

// PublishApplySDEVersion builds and locks the live Static Data Export to a build.
func PublishApplySDEVersion(ctx context.Context, n *NATS, buildNumber int) error {
	return publish(ctx, n, ApplySDEVersion, SDEApplyVersionRequest{BuildNumber: buildNumber})
}

// PublishRebuildCurrentSDEVersion rebuilds the Static Data Export already locked in.
func PublishRebuildCurrentSDEVersion(ctx context.Context, n *NATS, buildNumber int) error {
	return publish(ctx, n, RebuildCurrentSDEVersion, SDEApplyVersionRequest{BuildNumber: buildNumber})
}
