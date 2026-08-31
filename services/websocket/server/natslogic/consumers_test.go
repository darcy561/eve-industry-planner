package natslogic

import (
	"testing"
	"time"

	eipnats "eve-industry-planner/shared/nats"
)

func TestDocFanoutConsumerConfigsHaveInactiveThreshold(t *testing.T) {
	t.Setenv("HOSTNAME", "ws-test-replica")

	_, live := DocLiveUpdatesConsumerConfig()
	if live.InactiveThreshold != DocFanoutConsumerInactiveThreshold {
		t.Fatalf("live updates InactiveThreshold=%v want %v", live.InactiveThreshold, DocFanoutConsumerInactiveThreshold)
	}
	if live.InactiveThreshold != time.Hour {
		t.Fatalf("expected 1h threshold, got %v", live.InactiveThreshold)
	}
	if live.Durable != "doc-live-updates-ws-test-replica" {
		t.Fatalf("unexpected live durable %q", live.Durable)
	}
	if live.FilterSubject != "" || len(live.FilterSubjects) != 1 || live.FilterSubjects[0] != eipnats.DocUpdateFilterInert {
		t.Fatalf("live should start inert FilterSubjects, got subject=%q subjects=%v", live.FilterSubject, live.FilterSubjects)
	}

	_, lock := DocLockConsumerConfig()
	if lock.InactiveThreshold != DocFanoutConsumerInactiveThreshold {
		t.Fatalf("lock InactiveThreshold=%v want %v", lock.InactiveThreshold, DocFanoutConsumerInactiveThreshold)
	}
	if lock.Durable != "doc-lock-ws-test-replica" {
		t.Fatalf("unexpected lock durable %q", lock.Durable)
	}
	if lock.FilterSubject != "" || len(lock.FilterSubjects) != 1 || lock.FilterSubjects[0] != eipnats.DocLockFilterInert {
		t.Fatalf("lock should start inert FilterSubjects, got subject=%q subjects=%v", lock.FilterSubject, lock.FilterSubjects)
	}
}
