package commands

import (
	"strings"
	"testing"
	"time"

	eipnats "eve-industry-planner/shared/nats"
	"eve-industry-planner/testing/natsfake"

	"github.com/nats-io/nats.go/jetstream"
)

// The lookup is derived from the table, so a task cannot be runnable but
// unfindable, or findable under a name the table does not offer.
func TestEveryDispatchIsFindableByItsCommandName(t *testing.T) {
	t.Parallel()

	lookup := dispatchLookup()
	if len(lookup) != len(dispatchTable) {
		t.Fatalf("lookup holds %d entries for %d dispatches — two share a command name",
			len(lookup), len(dispatchTable))
	}

	for _, d := range dispatchTable {
		found, ok := lookup[strings.ToLower(d.command)]
		if !ok {
			t.Errorf("%q is listed but not findable", d.command)
			continue
		}
		if found.task.Name != d.task.Name {
			t.Errorf("%q resolves to %q, want %q", d.command, found.task.Name, d.task.Name)
		}
	}

	for key := range lookup {
		if key != strings.ToLower(key) {
			t.Errorf("lookup key %q is not lowercase, so a case-insensitive match cannot find it", key)
		}
	}
}

// Each entry pairs a definition with a closure, and nothing about the type stops
// the closure publishing a different task than the one it is listed against —
// the operator would be told one thing was queued while another ran.
//
// This publishes every entry for real and reads back which subject it landed on.
func TestEveryDispatchPublishesTheTaskItNames(t *testing.T) {
	for _, d := range dispatchTable {
		t.Run(d.command, func(t *testing.T) {
			nats := natsfake.New(t)
			if _, err := nats.NATS.Tasks.Ensure(t.Context()); err != nil {
				t.Fatalf("ensure task stream: %v", err)
			}

			// A version is only read by the entries that require one; passing it
			// everywhere keeps the table's shape out of this test.
			if err := d.publish(t.Context(), nats.NATS, taskOptions{version: 1, versionSet: true}); err != nil {
				t.Fatalf("publish: %v", err)
			}

			consumer, err := nats.NATS.Tasks.Consumer(t.Context(), jetstream.ConsumerConfig{
				Durable:       "dispatch-probe",
				FilterSubject: d.task.Subject,
				AckPolicy:     jetstream.AckExplicitPolicy,
				DeliverPolicy: jetstream.DeliverAllPolicy,
			})
			if err != nil {
				t.Fatalf("consumer: %v", err)
			}
			msgs, err := consumer.Fetch(1)
			if err != nil {
				t.Fatalf("fetch: %v", err)
			}
			select {
			case msg := <-msgs.Messages():
				if msg == nil {
					t.Fatalf("%q published nothing on %s", d.command, d.task.Subject)
				}
			case <-time.After(10 * time.Second):
				t.Fatalf("%q published nothing on %s, the subject it is listed against",
					d.command, d.task.Subject)
			}
		})
	}
}

// A task that requires a version must refuse to publish without one, rather than
// queueing a request the handler cannot use.
func TestADispatchNeedingAVersionRefusesWithoutOne(t *testing.T) {
	t.Parallel()

	d, ok := dispatchLookup()["applysdeversion"]
	if !ok {
		t.Fatal("applySdeVersion is not dispatchable")
	}
	for name, opts := range map[string]taskOptions{
		"no version":       {},
		"zero version":     {versionSet: true, version: 0},
		"negative version": {versionSet: true, version: -1},
	} {
		t.Run(name, func(t *testing.T) {
			// No NATS handle: a refusal must happen before anything is published.
			if err := d.publish(t.Context(), nil, opts); err == nil {
				t.Error("published without a usable version")
			}
		})
	}
}

// queueArchivedJobStatsRebuild tells an operator to run the drain by name. A
// drain that is not triggerable leaves those accounts waiting for the next cron
// tick with no way to hurry it, and that advice names a command that does not
// exist.
func TestDrainTaskIsTriggerable(t *testing.T) {
	t.Parallel()

	d, ok := dispatchLookup()["drainaccountstatsrebuildqueue"]
	if !ok {
		t.Fatal("drainAccountStatsRebuildQueue is not dispatchable; queueArchivedJobStatsRebuild tells operators to run it")
	}
	if d.task.Name != eipnats.DrainAccountStatsRebuildQueue.Name {
		t.Fatalf("resolves to %q, want %q", d.task.Name, eipnats.DrainAccountStatsRebuildQueue.Name)
	}
	if d.command != "drainAccountStatsRebuildQueue" {
		t.Fatalf("command is %q, want the name the usage text prints", d.command)
	}
}
