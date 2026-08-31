package nats

// Stream names
const (
	// WorkerTaskStream is the JetStream stream name for worker task processing
	WorkerTaskStream = "worker-task-stream"

	// SchedulerStream is the JetStream stream name for scheduler task requests
	SchedulerStream = "scheduler-stream"

	// DocUpdateStream is the JetStream stream name for document update notifications
	DocUpdateStream = "doc-update-stream"
)

// TaskSubjectPrefix is the subject prefix for all worker tasks. The worker subscribes to "task.>"
// and derives task type from the subject (last segment after the final dot).
// Task names, subjects, and default priorities are defined in shared/tasks.
const TaskSubjectPrefix = "task."

// Subject names (non-task; task subjects are in shared/tasks)
const (
	// SubjectSchedulerSchedule is the NATS subject for requesting one-time scheduled tasks
	SubjectSchedulerSchedule = "scheduler.schedule"

	// SubjectDocUpdate is the NATS subject prefix for document updates.
	// Format: doc.update.{tenantString}.{collection}.{docID}
	// Example: doc.update.account:abc.jobs.doc123
	SubjectDocUpdate = "doc.update"

	// SubjectDocLock is the NATS subject for document lock coordination (API → websocket fan-out).
	// Format: doc.lock.{accountID}
	SubjectDocLock = "doc.lock"

	// SubjectHealthCommandPing is the core-NATS fan-out subject for controller health census.
	// Every app replica Subscribe()s (no queue group) and Respond()s HealthStatus.
	SubjectHealthCommandPing = "health.command.ping"

	// SubjectWSPlacementState is core-NATS pub/sub for websocket placement load flags.
	// Payload: PlacementState (messages.go).
	SubjectWSPlacementState = "ws.placement.state"

	// SubjectWSCommandCordon / SubjectWSCommandDrain are planned evacuate req/reply
	// (capacity controller → matching websocket container_id). Distinct from SIGTERM DrainForRoll.
	SubjectWSCommandCordon   = "ws.command.cordon"
	SubjectWSCommandDrain    = "ws.command.drain"
	SubjectWSCommandUncordon = "ws.command.uncordon"
)

// Durable names / prefixes currently owned by the app. Stream reconcile allowlists
// are built from these — anything else on the stream is deleted as obsolete.
const (
	// ConsumerTaskWorker is the single shared durable on worker-task-stream.
	ConsumerTaskWorker = "task-worker"

	// ConsumerScheduler is the durable consumer name for scheduler
	ConsumerScheduler = "scheduler"

	// DurablePrefixDocLiveUpdates is the per-replica websocket fan-out prefix for doc.update.
	DurablePrefixDocLiveUpdates = "doc-live-updates-"

	// DurablePrefixDocLock is the per-replica websocket fan-out prefix for doc.lock.
	DurablePrefixDocLock = "doc-lock-"
)

// TaskNameRegionMarketOrdersRefresh is the human-readable label used in region
// market orders refresh logs.
const TaskNameRegionMarketOrdersRefresh = "region market orders refresh"
