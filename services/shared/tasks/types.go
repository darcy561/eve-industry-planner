package tasks

import "time"

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

// Task defines a worker task: name (handler key), NATS subject, default priority, and asynq execution timeout.
// Everything needed to publish and route the task lives here.
type Task struct {
	Name            string        // Task type identifier; used for asynq handler registration and subject suffix
	Subject         string        // Full NATS subject (e.g. "task.scheduled.refreshSystemIndexes")
	DefaultPriority string        // Default queue name (e.g. Priority3)
	DefaultTimeout  time.Duration // Asynq handler deadline; Publish may override via TaskMessage.timeout_seconds
}

// Task definitions — single source of truth for name, subject, default priority, and timeout.
var (
	MigrateUserDocumentToMongo = Task{
		Name:            "migrateUserDocumentToMongo",
		Subject:         "task.migration.migrateUserDocumentToMongo",
		DefaultPriority: Priority5,
		DefaultTimeout:  5 * time.Minute,
	}
	MigrateFirestoreWatchlistToMongo = Task{
		Name:            "migrateFirestoreWatchlistToMongo",
		Subject:         "task.migration.migrateFirestoreWatchlistToMongo",
		DefaultPriority: Priority5,
		DefaultTimeout:  2 * time.Minute,
	}
	// ImportArchivedJobToMongo normalizes one Firestore ArchivedJobs document and upserts [models.Job] into MongoDB archivedJobs.
	ImportArchivedJobToMongo = Task{
		Name:            "importArchivedJobToMongo",
		Subject:         "task.migration.importArchivedJobToMongo",
		DefaultPriority: Priority5,
		DefaultTimeout:  3 * time.Minute,
	}
	// ImportUserJobDocumentsForAccount copies referenced live Firestore job docs to Mongo user_job_documents (one account per task).
	ImportUserJobDocumentsForAccount = Task{
		Name:            "importUserJobDocumentsForAccount",
		Subject:         "task.migration.importUserJobDocumentsForAccount",
		DefaultPriority: Priority5,
		DefaultTimeout:  15 * time.Minute,
	}
	EncryptCloudRefreshTokensBatch = Task{
		Name:            "encryptCloudRefreshTokensBatch",
		Subject:         "task.migration.encryptCloudRefreshTokensBatch",
		DefaultPriority: Priority5,
		DefaultTimeout:  15 * time.Minute,
	}
	MigrateUserCloudAccountsToUserDoc = Task{
		Name:            "migrateUserCloudAccountsToUserDoc",
		Subject:         "task.migration.migrateUserCloudAccountsToUserDoc",
		DefaultPriority: Priority5,
		DefaultTimeout:  10 * time.Minute,
	}
	// ProcessArchivedJobSnapshots reads archivedJobs and upserts corp_archived_job_stats / user_archived_job_stats only.
	ProcessArchivedJobSnapshots = Task{
		Name:            "processArchivedJobSnapshots",
		Subject:         "task.scheduled.processArchivedJobSnapshots",
		DefaultPriority: Priority4,
		DefaultTimeout:  15 * time.Minute,
	}
	// ProcessCorpArchivedJobSnapshots reads corp_archivedJobs and upserts corp_archived_job_stats only.
	ProcessCorpArchivedJobSnapshots = Task{
		Name:            "processCorpArchivedJobSnapshots",
		Subject:         "task.scheduled.processCorpArchivedJobSnapshots",
		DefaultPriority: Priority4,
		DefaultTimeout:  15 * time.Minute,
	}
	// ProcessDirtyAccountBuildStats rebuilds build_stats / user_build_stats (cron publishes one task per queued account).
	ProcessDirtyAccountBuildStats = Task{
		Name:            "processDirtyAccountBuildStats",
		Subject:         "task.scheduled.processDirtyAccountBuildStats",
		DefaultPriority: Priority4,
		DefaultTimeout:  15 * time.Minute,
	}
	// ProcessDirtyCorpBuildStats rebuilds corp_build_stats for dirty refs (cron publishes one task per queued corp ref).
	ProcessDirtyCorpBuildStats = Task{
		Name:            "processDirtyCorpBuildStats",
		Subject:         "task.scheduled.processDirtyCorpBuildStats",
		DefaultPriority: Priority4,
		DefaultTimeout:  20 * time.Minute,
	}
	RefreshSystemIndexes = Task{
		Name:            "refreshSystemIndexes",
		Subject:         "task.scheduled.refreshSystemIndexes",
		DefaultPriority: Priority3,
		DefaultTimeout:  60 * time.Second,
	}
	RefreshAdjustedPrices = Task{
		Name:            "refreshAdjustedPrices",
		Subject:         "task.scheduled.refreshAdjustedPrices",
		DefaultPriority: Priority3,
		DefaultTimeout:  60 * time.Second,
	}
	RefreshMarketPrices = Task{
		Name:            "refreshMarketPrices",
		Subject:         "task.scheduled.refreshMarketPrices",
		DefaultPriority: Priority4,
		DefaultTimeout:  60 * time.Second,
	}
	CountMarketPricesItems = Task{
		Name:            "countMarketPricesItems",
		Subject:         "task.scheduled.countMarketPricesItems",
		DefaultPriority: Priority3,
		DefaultTimeout:  2 * time.Minute,
	}
	FetchMissingMarketPrices = Task{
		Name:            "fetchMissingMarketPrices",
		Subject:         "task.scheduled.fetchMissingMarketPrices",
		DefaultPriority: Priority2,
		DefaultTimeout:  60 * time.Second,
	}
	FetchCorporations = Task{
		Name:            "fetchCorporations",
		Subject:         "task.auth.fetchCorporations",
		DefaultPriority: Priority3,
		DefaultTimeout:  60 * time.Second,
	}
	CheckSDEUpdates = Task{
		Name:            "checkSDEUpdates",
		Subject:         "task.scheduled.checkSDEUpdates",
		DefaultPriority: Priority5,
		DefaultTimeout:  15 * time.Minute,
	}
	RollbackSDEVersion = Task{
		Name:            "rollbackSDEVersion",
		Subject:         "task.scheduled.rollbackSDEVersion",
		DefaultPriority: Priority5,
		DefaultTimeout:  15 * time.Minute,
	}
	ApplySDEVersion = Task{
		Name:            "applySDEVersion",
		Subject:         "task.scheduled.applySDEVersion",
		DefaultPriority: Priority5,
		DefaultTimeout:  15 * time.Minute,
	}
	RebuildCurrentSDEVersion = Task{
		Name:            "rebuildCurrentSDEVersion",
		Subject:         "task.scheduled.rebuildCurrentSDEVersion",
		DefaultPriority: Priority5,
		DefaultTimeout:  15 * time.Minute,
	}
	RotateRefreshTokenKeys = Task{
		Name:            "rotateRefreshTokenKeys",
		Subject:         "task.maintenance.rotateRefreshTokenKeys",
		DefaultPriority: Priority5,
		DefaultTimeout:  20 * time.Minute,
	}
	SchemaVersionMaintenanceBatch = Task{
		Name:            "schemaVersionMaintenanceBatch",
		Subject:         "task.maintenance.schemaVersionMaintenanceBatch",
		DefaultPriority: Priority5,
		DefaultTimeout:  3 * time.Minute,
	}
	InactiveAccountPlannerCleanup = Task{
		Name:            "inactiveAccountPlannerCleanup",
		Subject:         "task.maintenance.inactiveAccountPlannerCleanup",
		DefaultPriority: Priority5,
		DefaultTimeout:  5 * time.Minute,
	}
	CloudStoredEsiRefreshMaintenance = Task{
		Name:            "cloudStoredEsiRefreshMaintenance",
		Subject:         "task.maintenance.cloudStoredEsiRefreshMaintenance",
		DefaultPriority: Priority5,
		DefaultTimeout:  10 * time.Minute,
	}
)

// ByName maps task name (handler key) to task definition for lookup (e.g. worker default priority).
var ByName = map[string]Task{
	MigrateUserDocumentToMongo.Name:        MigrateUserDocumentToMongo,
	MigrateFirestoreWatchlistToMongo.Name:  MigrateFirestoreWatchlistToMongo,
	ImportArchivedJobToMongo.Name:          ImportArchivedJobToMongo,
	ImportUserJobDocumentsForAccount.Name:  ImportUserJobDocumentsForAccount,
	EncryptCloudRefreshTokensBatch.Name:    EncryptCloudRefreshTokensBatch,
	MigrateUserCloudAccountsToUserDoc.Name: MigrateUserCloudAccountsToUserDoc,
	ProcessArchivedJobSnapshots.Name:       ProcessArchivedJobSnapshots,
	ProcessCorpArchivedJobSnapshots.Name:    ProcessCorpArchivedJobSnapshots,
	ProcessDirtyAccountBuildStats.Name:     ProcessDirtyAccountBuildStats,
	ProcessDirtyCorpBuildStats.Name:        ProcessDirtyCorpBuildStats,
	RefreshSystemIndexes.Name:              RefreshSystemIndexes,
	RefreshAdjustedPrices.Name:             RefreshAdjustedPrices,
	RefreshMarketPrices.Name:               RefreshMarketPrices,
	CountMarketPricesItems.Name:            CountMarketPricesItems,
	FetchMissingMarketPrices.Name:          FetchMissingMarketPrices,
	FetchCorporations.Name:                 FetchCorporations,
	CheckSDEUpdates.Name:                   CheckSDEUpdates,
	RollbackSDEVersion.Name:                RollbackSDEVersion,
	ApplySDEVersion.Name:                   ApplySDEVersion,
	RebuildCurrentSDEVersion.Name:          RebuildCurrentSDEVersion,
	RotateRefreshTokenKeys.Name:            RotateRefreshTokenKeys,
	SchemaVersionMaintenanceBatch.Name:     SchemaVersionMaintenanceBatch,
	InactiveAccountPlannerCleanup.Name:     InactiveAccountPlannerCleanup,
	CloudStoredEsiRefreshMaintenance.Name:  CloudStoredEsiRefreshMaintenance,
}
