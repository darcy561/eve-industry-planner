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
)

// ByName maps task name (handler key) to task definition for lookup (e.g. worker default priority).
var ByName = map[string]Task{
	MigrateUserDocumentToMongo.Name: MigrateUserDocumentToMongo,
	RefreshSystemIndexes.Name:       RefreshSystemIndexes,
	RefreshAdjustedPrices.Name:      RefreshAdjustedPrices,
	RefreshMarketPrices.Name:        RefreshMarketPrices,
	CountMarketPricesItems.Name:     CountMarketPricesItems,
	FetchMissingMarketPrices.Name:   FetchMissingMarketPrices,
	FetchCorporations.Name:          FetchCorporations,
	CheckSDEUpdates.Name:            CheckSDEUpdates,
	RollbackSDEVersion.Name:         RollbackSDEVersion,
	ApplySDEVersion.Name:            ApplySDEVersion,
	RebuildCurrentSDEVersion.Name:   RebuildCurrentSDEVersion,
}
