package nats_test

import (
	"context"
	"testing"

	eipnats "eve-industry-planner/shared/nats"
	"eve-industry-planner/testing/natsfake"
)

// A batching handle publishes without waiting, and Wait is where the messages
// are known to have been stored.
func TestLiveBatchPublishesEverything(t *testing.T) {
	fake := natsfake.New(t)
	ctx := context.Background()

	stream, err := fake.NATS.Tasks.Ensure(ctx)
	if err != nil {
		t.Fatal(err)
	}

	const count = 50
	batch := fake.NATS.Batching()
	for i := range count {
		if err := eipnats.PublishEncodeJobIdentity(ctx, batch, "account", "collection", i%2 == 0); err != nil {
			t.Fatalf("publish %d: %v", i, err)
		}
	}
	if pending := batch.Pending(); pending != count {
		t.Fatalf("pending %d before Wait, want %d", pending, count)
	}
	if err := batch.Wait(ctx); err != nil {
		t.Fatalf("Wait: %v", err)
	}
	if pending := batch.Pending(); pending != 0 {
		t.Fatalf("pending %d after Wait, want 0", pending)
	}

	info, err := stream.Info(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if info.State.Msgs != count {
		t.Fatalf("stream holds %d messages, want %d", info.State.Msgs, count)
	}
}

// Waiting twice is not an error, and the second call has nothing to collect.
func TestLiveBatchWaitIsRepeatable(t *testing.T) {
	fake := natsfake.New(t)
	ctx := context.Background()

	if _, err := fake.NATS.Tasks.Ensure(ctx); err != nil {
		t.Fatal(err)
	}
	batch := fake.NATS.Batching()
	if err := eipnats.PublishEncodeJobIdentity(ctx, batch, "a", "c", false); err != nil {
		t.Fatal(err)
	}
	if err := batch.Wait(ctx); err != nil {
		t.Fatal(err)
	}
	if err := batch.Wait(ctx); err != nil {
		t.Fatalf("second Wait: %v", err)
	}
}

// The handle a batch came from keeps publishing synchronously.
func TestLiveBatchingDoesNotAffectTheOriginalHandle(t *testing.T) {
	fake := natsfake.New(t)
	ctx := context.Background()

	if _, err := fake.NATS.Tasks.Ensure(ctx); err != nil {
		t.Fatal(err)
	}
	_ = fake.NATS.Batching()
	if err := eipnats.PublishEncodeJobIdentity(ctx, fake.NATS, "a", "c", false); err != nil {
		t.Fatal(err)
	}
	if pending := fake.NATS.Pending(); pending != 0 {
		t.Fatalf("original handle has %d pending; it should publish synchronously", pending)
	}
}
