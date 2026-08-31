package nats_test

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	eipnats "eve-industry-planner/shared/nats"
	"eve-industry-planner/testing/natsfake"

	"github.com/nats-io/nats.go/jetstream"
)

func fanoutConsumer(t *testing.T, docUpdate *eipnats.Stream, durable string) {
	t.Helper()
	if _, err := docUpdate.Consumer(context.Background(), jetstream.ConsumerConfig{
		Durable:        durable,
		FilterSubjects: []string{eipnats.DocUpdateFilterInert},
		DeliverPolicy:  jetstream.DeliverNewPolicy,
		AckPolicy:      jetstream.AckExplicitPolicy,
	}); err != nil {
		t.Fatalf("create %s: %v", durable, err)
	}
}

func consumerExists(t *testing.T, stream jetstream.Stream, durable string) bool {
	t.Helper()
	_, err := stream.Consumer(context.Background(), durable)
	if err == nil {
		return true
	}
	if errors.Is(err, jetstream.ErrConsumerNotFound) {
		return false
	}
	t.Fatalf("consumer %s: %v", durable, err)
	return false
}

// A durable of an older naming generation is deleted; this replica's and a
// peer's are kept, whether or not either has a pull outstanding.
func TestLiveReconcileDeletesObsoleteKeepsPeers(t *testing.T) {
	fake := natsfake.New(t)
	docUpdate := fake.NATS.DocUpdate
	ctx := context.Background()

	stream, err := docUpdate.Ensure(ctx)
	if err != nil {
		t.Fatal(err)
	}

	mine := eipnats.DurablePrefixDocLiveUpdates + "mine"
	peer := eipnats.DurablePrefixDocLiveUpdates + "peer"
	obsolete := "doc-updates-old-generation"
	for _, durable := range []string{mine, peer, obsolete} {
		fanoutConsumer(t, docUpdate, durable)
	}

	result, err := docUpdate.Reconcile(ctx, mine)
	if err != nil {
		t.Fatal(err)
	}
	if result.Deleted != 1 {
		t.Fatalf("deleted %d, want 1", result.Deleted)
	}
	if consumerExists(t, stream, obsolete) {
		t.Error("obsolete durable survived")
	}
	if !consumerExists(t, stream, mine) {
		t.Error("this replica's durable was deleted")
	}
	if !consumerExists(t, stream, peer) {
		t.Error("a peer's durable was deleted with no pull outstanding")
	}
}

// Reconcile stamps the crash backstop, which is what reaps a durable whose
// replica died without deleting it.
func TestLiveReconcileStampsInactiveThreshold(t *testing.T) {
	fake := natsfake.New(t)
	docUpdate := fake.NATS.DocUpdate
	ctx := context.Background()

	stream, err := docUpdate.Ensure(ctx)
	if err != nil {
		t.Fatal(err)
	}
	durable := eipnats.DurablePrefixDocLock + "stamped"
	if _, err := docUpdate.Consumer(ctx, jetstream.ConsumerConfig{
		Durable:           durable,
		FilterSubjects:    []string{eipnats.DocLockFilterInert},
		DeliverPolicy:     jetstream.DeliverLastPolicy,
		AckPolicy:         jetstream.AckExplicitPolicy,
		InactiveThreshold: time.Minute,
	}); err != nil {
		t.Fatal(err)
	}

	if _, err := docUpdate.Reconcile(ctx, durable); err != nil {
		t.Fatal(err)
	}

	consumer, err := stream.Consumer(ctx, durable)
	if err != nil {
		t.Fatal(err)
	}
	info, err := consumer.Info(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if info.Config.InactiveThreshold != eipnats.DocFanoutInactiveThreshold {
		t.Fatalf("InactiveThreshold=%v want %v", info.Config.InactiveThreshold, eipnats.DocFanoutInactiveThreshold)
	}
}

// A durable this app did not create is never a deletion candidate, however
// little its name resembles one of ours.
func TestLiveReconcileLeavesUnownedConsumers(t *testing.T) {
	fake := natsfake.New(t)
	docUpdate := fake.NATS.DocUpdate
	ctx := context.Background()

	stream, err := docUpdate.Ensure(ctx)
	if err != nil {
		t.Fatal(err)
	}
	const foreign = "somebody-elses-durable"
	if _, err := stream.CreateOrUpdateConsumer(ctx, jetstream.ConsumerConfig{
		Durable:       foreign,
		FilterSubject: eipnats.DocUpdateFilterInert,
		AckPolicy:     jetstream.AckExplicitPolicy,
	}); err != nil {
		t.Fatal(err)
	}

	result, err := docUpdate.Reconcile(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if result.Deleted != 0 {
		t.Fatalf("deleted %d unowned consumers, want 0", result.Deleted)
	}
	if result.Skipped != 1 {
		t.Fatalf("skipped %d, want 1", result.Skipped)
	}
	if !consumerExists(t, stream, foreign) {
		t.Error("an unowned durable was deleted")
	}
}

// Graceful stop deletes this replica's durables outright rather than waiting for
// the backstop.
func TestLiveDeleteConsumersRemovesOwnDurables(t *testing.T) {
	fake := natsfake.New(t)
	docUpdate := fake.NATS.DocUpdate
	ctx := context.Background()

	stream, err := docUpdate.Ensure(ctx)
	if err != nil {
		t.Fatal(err)
	}
	live := eipnats.DurablePrefixDocLiveUpdates + "leaving"
	lock := eipnats.DurablePrefixDocLock + "leaving"
	fanoutConsumer(t, docUpdate, live)
	fanoutConsumer(t, docUpdate, lock)

	if ok := eipnats.DeleteConsumers(ctx, stream, live, lock); ok != 2 {
		t.Fatalf("deleted %d durables, want 2", ok)
	}
	if consumerExists(t, stream, live) || consumerExists(t, stream, lock) {
		t.Error("durables survived graceful delete")
	}
}

// Concurrency bounds how many handlers run at once, and stop waits for the ones
// in flight rather than abandoning them.
func TestLiveConsumeBoundedConcurrency(t *testing.T) {
	fake := natsfake.New(t)
	tasks := fake.NATS.Tasks
	ctx := context.Background()

	if _, err := tasks.Ensure(ctx); err != nil {
		t.Fatal(err)
	}
	consumer, err := tasks.Consumer(ctx, jetstream.ConsumerConfig{
		Durable:       eipnats.ConsumerTaskWorker,
		FilterSubject: tasks.Spec().Subjects[0],
		DeliverPolicy: jetstream.DeliverAllPolicy,
		AckPolicy:     jetstream.AckExplicitPolicy,
	})
	if err != nil {
		t.Fatal(err)
	}

	const messages = 12
	for i := range messages {
		if err := fake.NATS.Publish(ctx, "task.scheduled.concurrencyProbe", eipnats.Message{Type: eipnats.MessageTypeEmpty}); err != nil {
			t.Fatalf("publish %d: %v", i, err)
		}
	}

	var (
		mu       sync.Mutex
		inFlight int
		peak     int
		done     = make(chan struct{}, messages)
	)
	stop, err := eipnats.Consume(consumer, "task.>", func(msg jetstream.Msg) {
		mu.Lock()
		inFlight++
		peak = max(peak, inFlight)
		mu.Unlock()

		time.Sleep(20 * time.Millisecond)

		mu.Lock()
		inFlight--
		mu.Unlock()
		eipnats.AcknowledgeMessage(ctx, msg, "test", 1)
		done <- struct{}{}
	}, eipnats.WithConcurrency(3))
	if err != nil {
		t.Fatal(err)
	}

	for range messages {
		select {
		case <-done:
		case <-time.After(10 * time.Second):
			stop()
			t.Fatal("timed out waiting for messages")
		}
	}
	stop()

	mu.Lock()
	defer mu.Unlock()
	if peak > 3 {
		t.Fatalf("peak concurrency %d exceeds the bound of 3", peak)
	}
	if peak < 2 {
		t.Fatalf("peak concurrency %d suggests handlers never overlapped", peak)
	}
	if inFlight != 0 {
		t.Fatalf("%d handlers still in flight after stop", inFlight)
	}
}

// A stream this app owns but no longer declares is deleted; a declared one and a
// stream nobody stamped both survive.
func TestLiveReconcileStreamsDeletesUndeclared(t *testing.T) {
	fake := natsfake.New(t)
	ctx := context.Background()

	if _, err := fake.NATS.Tasks.Ensure(ctx); err != nil {
		t.Fatal(err)
	}

	// A stream this app made and then stopped declaring.
	if _, err := fake.JS().CreateStream(ctx, jetstream.StreamConfig{
		Name:     "retired-stream",
		Subjects: []string{"retired.>"},
		Metadata: map[string]string{eipnats.MetadataOwnerKey: eipnats.MetadataOwnerValue},
	}); err != nil {
		t.Fatal(err)
	}
	// A stream from somewhere else entirely.
	if _, err := fake.JS().CreateStream(ctx, jetstream.StreamConfig{
		Name:     "KV_somebody_else",
		Subjects: []string{"$KV.somebody_else.>"},
	}); err != nil {
		t.Fatal(err)
	}

	result, err := fake.NATS.ReconcileStreams(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if result.Deleted != 1 {
		t.Fatalf("deleted %d streams, want 1", result.Deleted)
	}
	if result.Skipped != 1 {
		t.Fatalf("skipped %d unowned streams, want 1", result.Skipped)
	}
	if _, err := fake.JS().Stream(ctx, "retired-stream"); err == nil {
		t.Error("undeclared stream survived")
	}
	if _, err := fake.JS().Stream(ctx, "KV_somebody_else"); err != nil {
		t.Errorf("unowned stream was deleted: %v", err)
	}
	if _, err := fake.JS().Stream(ctx, eipnats.WorkerTaskStream); err != nil {
		t.Errorf("declared stream was deleted: %v", err)
	}
}
