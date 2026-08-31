package nats

import "time"

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
}

// Specs is the source of truth for the streams this app owns. A stream carrying
// the ownership stamp but absent from here is obsolete and reconcile deletes it.
func Specs() []StreamSpec {
	return []StreamSpec{TaskStreamSpec(), SchedulerStreamSpec(), DocUpdateStreamSpec()}
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

// SchedulerStreamSpec carries scheduler requests; one shared durable consumes them.
func SchedulerStreamSpec() StreamSpec {
	return StreamSpec{
		Name:     SchedulerStream,
		Subjects: []string{"scheduler.>"},
		MaxAge:   24 * time.Hour,
		Keep:     StreamConsumerKeepPolicy{KeepExact: []string{ConsumerScheduler}},
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
