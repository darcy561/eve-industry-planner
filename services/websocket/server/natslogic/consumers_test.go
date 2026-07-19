package natslogic

import (
	"testing"
	"time"
)

func TestDocFanoutConsumerConfigsHaveInactiveThreshold(t *testing.T) {
	t.Setenv("OTEL_SERVICE_INSTANCE_ID", "ws-test-replica")

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

	_, lock := DocLockConsumerConfig()
	if lock.InactiveThreshold != DocFanoutConsumerInactiveThreshold {
		t.Fatalf("lock InactiveThreshold=%v want %v", lock.InactiveThreshold, DocFanoutConsumerInactiveThreshold)
	}
	if lock.Durable != "doc-lock-ws-test-replica" {
		t.Fatalf("unexpected lock durable %q", lock.Durable)
	}
}
