package nats

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/nats-io/nats.go/jetstream"
)

func TestConsumerKeptByPolicy(t *testing.T) {
	t.Parallel()
	doc := DocUpdateFanoutKeepPolicy(time.Hour, "doc-live-updates-mine", "doc-lock-mine")
	worker := WorkerTaskKeepPolicy()
	sched := SchedulerKeepPolicy()

	cases := []struct {
		name   string
		policy StreamConsumerKeepPolicy
		want   bool
	}{
		{"doc-live-updates-mine", doc, true},
		{"doc-lock-mine", doc, true},
		{"doc-live-updates-005ebc95a6a3", doc, true},
		{"doc-lock-005ebc95a6a3", doc, true},
		{"doc-updates-f5aa2b48c30f", doc, false},
		{"doc-subscribe-022b62ad5c2e", doc, false},
		{"doc-live-subscribe-01ad9b6e021f", doc, false},
		{"doc-updates", doc, false},
		{"task-worker", doc, false},
		{"task-worker", worker, true},
		{"task-scheduled", worker, false},
		{"task-scheduled-market-prices", worker, false},
		{"task-auth", worker, false},
		{"scheduler", sched, true},
		{"scheduler-old", sched, false},
	}
	for _, tc := range cases {
		if got := ConsumerKeptByPolicy(tc.name, tc.policy); got != tc.want {
			t.Errorf("ConsumerKeptByPolicy(%q)=%v want %v", tc.name, got, tc.want)
		}
	}
}

func TestIsConsumerNotFound(t *testing.T) {
	t.Parallel()
	if !isConsumerNotFound(jetstream.ErrConsumerNotFound) {
		t.Fatal("direct ErrConsumerNotFound")
	}
	if !isConsumerNotFound(errors.Join(jetstream.ErrConsumerNotFound, errors.New("wrap"))) {
		t.Fatal("wrapped ErrConsumerNotFound")
	}
	if isConsumerNotFound(nil) || isConsumerNotFound(errors.New("other")) {
		t.Fatal("non not-found should be false")
	}
}

func TestDeleteConsumerNoop(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	if err := DeleteConsumer(ctx, nil, "doc-live-updates-x"); err != nil {
		t.Fatalf("nil stream: %v", err)
	}
	if err := DeleteConsumer(ctx, nil, ""); err != nil {
		t.Fatalf("empty name: %v", err)
	}
	if n := DeleteConsumers(ctx, nil, "a", "", "b"); n != 2 {
		t.Fatalf("DeleteConsumers nil stream ok=%d want 2 (not-found/noop path)", n)
	}
}

func TestDocUpdateFanoutKeepPolicyIncludesExactAndThreshold(t *testing.T) {
	t.Parallel()
	p := DocUpdateFanoutKeepPolicy(time.Hour, "doc-live-updates-a", "doc-lock-a")
	if len(p.KeepExact) != 2 {
		t.Fatalf("KeepExact=%v", p.KeepExact)
	}
	if p.InactiveThreshold != time.Hour {
		t.Fatalf("InactiveThreshold=%v", p.InactiveThreshold)
	}
	if !p.ApplyThresholdToExact {
		t.Fatal("expected ApplyThresholdToExact")
	}
}
