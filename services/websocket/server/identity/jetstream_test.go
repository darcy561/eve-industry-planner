package identity

import (
	"testing"

	natscore "eve-industry-planner/shared/core/nats"
)

func TestJetStreamDurablesUseContainerID(t *testing.T) {
	t.Setenv("HOSTNAME", "abc123def456")

	live := DocLiveUpdatesJetStreamDurable()
	lock := DocLockJetStreamDurable()
	if live != natscore.DurablePrefixDocLiveUpdates+"abc123def456" {
		t.Fatalf("live=%q", live)
	}
	if lock != natscore.DurablePrefixDocLock+"abc123def456" {
		t.Fatalf("lock=%q", lock)
	}
	if live == lock {
		t.Fatal("live and lock durables must differ")
	}
}
