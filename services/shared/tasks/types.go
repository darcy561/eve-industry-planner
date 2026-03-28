package tasks

// Priority queue names for task routing. Use with Publish to override a task's default.
const (
	Priority1 = "priority_1" // Reserved for future critical tasks
	Priority2 = "priority_2" // Urgent, user-impacting
	Priority3 = "priority_3" // Default, steady throughput
	Priority4 = "priority_4" // High-volume background
	Priority5 = "priority_5" // Reserved / bulk tasks (lowest)
)

// Task defines a worker task: name (handler key), NATS subject, and default priority.
// Everything needed to publish and route the task lives here.
type Task struct {
	Name            string // Task type identifier; used for asynq handler registration and subject suffix
	Subject         string // Full NATS subject (e.g. "task.scheduled.refreshSystemIndexes")
	DefaultPriority string // Default queue name (e.g. Priority3)
}

// Task definitions — single source of truth for name, subject, and default priority.
var (
	MigrateUserDocumentToMongo = Task{
		Name:            "migrateUserDocumentToMongo",
		Subject:         "task.migration.migrateUserDocumentToMongo",
		DefaultPriority: Priority5,
	}
	RefreshSystemIndexes = Task{
		Name:            "refreshSystemIndexes",
		Subject:         "task.scheduled.refreshSystemIndexes",
		DefaultPriority: Priority3,
	}
	RefreshAdjustedPrices = Task{
		Name:            "refreshAdjustedPrices",
		Subject:         "task.scheduled.refreshAdjustedPrices",
		DefaultPriority: Priority3,
	}
	RefreshMarketPrices = Task{
		Name:            "refreshMarketPrices",
		Subject:         "task.scheduled.refreshMarketPrices",
		DefaultPriority: Priority4,
	}
	CountMarketPricesItems = Task{
		Name:            "countMarketPricesItems",
		Subject:         "task.scheduled.countMarketPricesItems",
		DefaultPriority: Priority3,
	}
	FetchMissingMarketPrices = Task{
		Name:            "fetchMissingMarketPrices",
		Subject:         "task.scheduled.fetchMissingMarketPrices",
		DefaultPriority: Priority2,
	}
	FetchCorporations = Task{
		Name:            "fetchCorporations",
		Subject:         "task.auth.fetchCorporations",
		DefaultPriority: Priority3,
	}
)

// ByName maps task name (handler key) to task definition for lookup (e.g. worker default priority).
var ByName = map[string]Task{
	MigrateUserDocumentToMongo.Name: MigrateUserDocumentToMongo,
	RefreshSystemIndexes.Name:     RefreshSystemIndexes,
	RefreshAdjustedPrices.Name:    RefreshAdjustedPrices,
	RefreshMarketPrices.Name:      RefreshMarketPrices,
	CountMarketPricesItems.Name:   CountMarketPricesItems,
	FetchMissingMarketPrices.Name: FetchMissingMarketPrices,
	FetchCorporations.Name:        FetchCorporations,
}
