package nats

import "time"

// Stream names
const (
	// WorkerTaskStream is the JetStream stream name for worker task processing
	WorkerTaskStream = "worker-task-stream"

	// DocUpdateStream is the JetStream stream name for document update notifications
	DocUpdateStream = "doc-update-stream"

	// ScheduleStream holds schedules and the subjects they deliver to when
	// they fire.
	ScheduleStream = "schedule-stream"
)

// TaskSubjectPrefix is the subject prefix for all worker tasks. The worker subscribes to "task.>"
// and derives task type from the subject (last segment after the final dot).
// Task names, subjects, and default priorities are defined in shared/tasks.
const TaskSubjectPrefix = "task."

// Subject names (non-task; task subjects are in shared/tasks)
const (
	// SubjectDocUpdate is the NATS subject prefix for document updates.
	// Format: doc.update.{tenantString}.{collection}.{docID}
	// Example: doc.update.account:abc.jobs.doc123
	SubjectDocUpdate = "doc.update"

	// SubjectSchedulePrefix holds one schedule per subject: schedule.{id}.
	SubjectSchedulePrefix = "schedule"

	// SubjectScheduledPrefix is where a schedule delivers when it fires:
	// scheduled.{id}.
	SubjectScheduledPrefix = "scheduled"

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

	// ConsumerScheduleRunner is the durable that receives schedules as they fire.
	ConsumerScheduleRunner = "schedule-runner"

	// DurablePrefixDocLiveUpdates is the per-replica websocket fan-out prefix for doc.update.
	DurablePrefixDocLiveUpdates = "doc-live-updates-"

	// DurablePrefixDocLock is the per-replica websocket fan-out prefix for doc.lock.
	DurablePrefixDocLock = "doc-lock-"
)

// TaskNameRegionMarketOrdersRefresh is the human-readable label used in region
// market orders refresh logs.
const TaskNameRegionMarketOrdersRefresh = "region market orders refresh"

// Stream ownership metadata. Stream and consumer reconcile only ever deletes
// what carries this stamp, so anything created outside this package — a KV or
// object-store backing stream, an operator's own — is never a candidate.
const (
	MetadataOwnerKey   = "eip.owner"
	MetadataOwnerValue = "eve-industry-planner"
)

// DocFanoutInactiveThreshold is the crash backstop for per-replica fan-out
// durables: how long one may sit without pull activity before the server deletes
// it. Graceful stop deletes them explicitly; this covers a missed shutdown.
const DocFanoutInactiveThreshold = time.Hour

// StreamSpec declares a stream this app owns: what it is called, what it
// accepts, how long it keeps it, and which durables belong on it.
type StreamSpec struct {
	Name     string
	Subjects []string
	MaxAge   time.Duration
	Keep     StreamConsumerKeepPolicy
	// Schedules lets the server hold scheduled messages on this stream.
	Schedules bool
}

// Specs is the source of truth for the streams this app owns. A stream carrying
// the ownership stamp but absent from here is obsolete and reconcile deletes it.
func Specs() []StreamSpec {
	return []StreamSpec{TaskStreamSpec(), DocUpdateStreamSpec(), ScheduleStreamSpec()}
}

// TaskStreamSpec accepts every worker task subject; one shared durable consumes them.
func TaskStreamSpec() StreamSpec {
	return StreamSpec{
		Name:     WorkerTaskStream,
		Subjects: []string{TaskSubjectPrefix + ">"},
		MaxAge:   24 * time.Hour,
		Keep:     StreamConsumerKeepPolicy{KeepExact: []string{ConsumerTaskWorker}},
	}
}

// DocUpdateStreamSpec carries document updates and lock events to websocket
// replicas. Retention is short because delivery is live: a replica absent this
// long has no clients waiting on the backlog. Durables are per-replica, so the
// keep policy is by prefix and the exact names are supplied by the caller.
func DocUpdateStreamSpec() StreamSpec {
	return StreamSpec{
		Name:     DocUpdateStream,
		Subjects: []string{SubjectDocUpdate + ".>", SubjectDocLock + ".>"},
		MaxAge:   time.Hour,
		Keep: StreamConsumerKeepPolicy{
			KeepPrefixes:          []string{DurablePrefixDocLiveUpdates, DurablePrefixDocLock},
			InactiveThreshold:     DocFanoutInactiveThreshold,
			ApplyThresholdToExact: true,
		},
	}
}

// ScheduleStreamSpec holds schedules. A schedule lives on
// `schedule.{id}` and names a delivery subject under `scheduled.` that a
// consumer watches; both are on this stream because a schedule's target must be.
//
// Retention is long because a schedule is state, not traffic: it must survive
// until it fires or is cancelled.
func ScheduleStreamSpec() StreamSpec {
	return StreamSpec{
		Name:      ScheduleStream,
		Subjects:  []string{SubjectSchedulePrefix + ".>", SubjectScheduledPrefix + ".>"},
		MaxAge:    0,
		Schedules: true,
		Keep:      StreamConsumerKeepPolicy{KeepExact: []string{ConsumerScheduleRunner}},
	}
}
