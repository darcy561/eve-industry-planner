package identity

import (
	"testing"

	eipnats "eve-industry-planner/shared/nats"
)

func TestJetStreamDurablesUseContainerID(t *testing.T) {
	t.Setenv("HOSTNAME", "abc123def456")

	live := DocLiveUpdatesJetStreamDurable()
	lock := DocLockJetStreamDurable()
	if live != eipnats.DurablePrefixDocLiveUpdates+"abc123def456" {
		t.Fatalf("live=%q", live)
	}
	if lock != eipnats.DurablePrefixDocLock+"abc123def456" {
		t.Fatalf("lock=%q", lock)
	}
	if live == lock {
		t.Fatal("live and lock durables must differ")
	}
}
