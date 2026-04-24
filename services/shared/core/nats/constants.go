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

// WorkerTaskStreamSubjects are the subject patterns for the worker task stream
// The stream accepts all subjects starting with "task."
var WorkerTaskStreamSubjects = []string{
	"task.>",
}

// TaskSubjectPrefix is the subject prefix for all worker tasks. The worker subscribes to "task.>"
// and derives task type from the subject (last segment after the final dot).
// Task names, subjects, and default priorities are defined in shared/tasks.
const TaskSubjectPrefix = "task."

// SchedulerStreamSubjects are the subject patterns for the scheduler stream
// The stream accepts all subjects starting with "scheduler."
// Consumers filter to specific patterns if needed
var SchedulerStreamSubjects = []string{
	"scheduler.>",
}

// DocUpdateStreamSubjects are the subject patterns bound to doc-update-stream.
var DocUpdateStreamSubjects = []string{
	"doc.update.>",
	"doc.lock.>",
}

// Subject names (non-task; task subjects are in shared/tasks)
const (
	// SubjectSchedulerSchedule is the NATS subject for requesting one-time scheduled tasks
	SubjectSchedulerSchedule = "scheduler.schedule"

	// SubjectDocUpdate is the NATS subject pattern for document updates
	// Format: doc.update.{docID}
	// Example: doc.update.user123, doc.update.job456
	SubjectDocUpdate = "doc.update"

	// SubjectDocSubscribe is the NATS subject pattern for document subscribe
	// Format: doc.subscribe.{docID}
	// Example: doc.subscribe.user123, doc.subscribe.job456
	SubjectDocSubscribe = "doc.subscribe"

	// SubjectDocUnsubscribe is the NATS subject pattern for document unsubscribe
	// Format: doc.unsubscribe.{docID}
	// Example: doc.unsubscribe.user123, doc.unsubscribe.job456
	SubjectDocUnsubscribe = "doc.unsubscribe"

	// SubjectDocLock is the NATS subject for document lock coordination (API → websocket fan-out).
	// Format: doc.lock.{accountID}
	SubjectDocLock = "doc.lock"

	// SubjectDocUpdateFanout is the legacy core-NATS prefix (ws.doc.fanout.{collection}.{docID}).
	// Live websocket delivery uses JetStream doc.update.> with a per-replica durable consumer instead.
	SubjectDocUpdateFanout = "ws.doc.fanout"

	// SubjectDocSubscribeFanout is the legacy core-NATS prefix (ws.doc.subscribe.fanout.{accountID}).
	SubjectDocSubscribeFanout = "ws.doc.subscribe.fanout"
)

// Consumer names for JetStream pull consumers
const (
	// ConsumerTaskScheduled is the durable consumer name for all scheduled tasks (task.scheduled.>)
	ConsumerTaskScheduled = "task-scheduled"

	// ConsumerTaskAuth is the durable consumer name for all auth tasks (task.auth.>)
	ConsumerTaskAuth = "task-auth"

	// ConsumerScheduler is the durable consumer name for scheduler
	ConsumerScheduler = "scheduler"

	// ConsumerDocUpdates is the durable consumer name for document update notifications
	ConsumerDocUpdates = "doc-updates"
)

// Task names for logging purposes (human-readable labels)
const (
	// TaskNameSystemIndexesRefresh is the human-readable name for system indexes refresh task
	TaskNameSystemIndexesRefresh = "system indexes refresh"

	// TaskNameAdjustedPricesRefresh is the human-readable name for adjusted prices refresh task
	TaskNameAdjustedPricesRefresh = "adjusted prices refresh"

	// TaskNameMarketPricesRefresh is the human-readable name for market prices refresh task
	TaskNameMarketPricesRefresh = "market prices refresh"

	// TaskNameCorporationsFetch is the human-readable name for corporation lookup task
	TaskNameCorporationsFetch = "corporations fetch"
)
