package nats_test

import (
	"context"
	"testing"

	eipnats "eve-industry-planner/shared/nats"
	"eve-industry-planner/testing/natsfake"

	"github.com/nats-io/nats.go/jetstream"
)

// DeliverPolicy is immutable on an existing consumer — the server rejects the
// update — so Consumer must recreate the durable rather than try to update it.
// Reset does not help: it resets delivery state, not policy.
func TestConsumerRecreatesOnDeliverPolicyChange(t *testing.T) {
	fake := natsfake.New(t)
	ctx := context.Background()
	s := fake.NATS.DocUpdate

	cfg := jetstream.ConsumerConfig{
		Durable:        "drift-probe",
		FilterSubjects: []string{eipnats.DocUpdateFilterInert},
		DeliverPolicy:  jetstream.DeliverAllPolicy,
		AckPolicy:      jetstream.AckExplicitPolicy,
	}
	if _, err := s.Consumer(ctx, cfg); err != nil {
		t.Fatalf("create: %v", err)
	}
	cfg.DeliverPolicy = jetstream.DeliverNewPolicy
	c, err := s.Consumer(ctx, cfg)
	if err != nil {
		t.Fatalf("DeliverPolicy change not recovered: %v", err)
	}
	info, _ := c.Info(ctx)
	if info.Config.DeliverPolicy != jetstream.DeliverNewPolicy {
		t.Fatal("DeliverPolicy silently unchanged")
	}
}
