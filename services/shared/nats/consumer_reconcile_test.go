package nats

import (
	"context"
	"errors"
	"testing"

	"github.com/nats-io/nats.go/jetstream"
)

func TestConsumerKeepPolicy(t *testing.T) {
	t.Parallel()
	doc := DocUpdateStreamSpec().Keep
	doc.KeepExact = []string{"doc-live-updates-mine", "doc-lock-mine"}
	worker := TaskStreamSpec().Keep

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
	}
	for _, tc := range cases {
		if got := consumerKeptByPolicy(tc.name, tc.policy); got != tc.want {
			t.Errorf("consumerKeptByPolicy(%q)=%v want %v", tc.name, got, tc.want)
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

// The fan-out spec carries the crash backstop; a replica adds its own durables
// as exact keeps when it reconciles.
func TestDocUpdateSpecKeepCarriesThreshold(t *testing.T) {
	t.Parallel()
	p := DocUpdateStreamSpec().Keep
	if p.InactiveThreshold != DocFanoutInactiveThreshold {
		t.Fatalf("InactiveThreshold=%v", p.InactiveThreshold)
	}
	if !p.ApplyThresholdToExact {
		t.Fatal("expected ApplyThresholdToExact")
	}
	if len(p.KeepPrefixes) != 2 {
		t.Fatalf("KeepPrefixes=%v", p.KeepPrefixes)
	}
}
