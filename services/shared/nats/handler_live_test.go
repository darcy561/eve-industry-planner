package nats_test

import (
	"context"
	"errors"
	"testing"
	"time"

	eipnats "eve-industry-planner/shared/nats"
	"eve-industry-planner/testing/natsfake"

	"github.com/nats-io/nats.go/jetstream"
)

// deliver publishes one message and runs it through a handler, returning how the
// message was left: acknowledged, or redelivered.
func deliver(t *testing.T, handler eipnats.Handler) (redelivered bool) {
	t.Helper()
	fake := natsfake.New(t)
	ctx := context.Background()

	if _, err := fake.NATS.Tasks.Ensure(ctx); err != nil {
		t.Fatal(err)
	}
	consumer, err := fake.NATS.Tasks.Consumer(ctx, jetstream.ConsumerConfig{
		Durable:       eipnats.ConsumerTaskWorker,
		FilterSubject: "task.>",
		DeliverPolicy: jetstream.DeliverAllPolicy,
		AckPolicy:     jetstream.AckExplicitPolicy,
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := fake.NATS.Publish(ctx, "task.scheduled.handlerProbe", eipnats.Message{Type: eipnats.MessageTypeEmpty}); err != nil {
		t.Fatal(err)
	}

	done := make(chan struct{})
	var once bool
	stop, err := eipnats.Consume(consumer, "task.>", eipnats.Handle("test", "test.handle",
		func(ctx context.Context, msg jetstream.Msg) error {
			if !once {
				once = true
				defer close(done)
			}
			return handler(ctx, msg)
		}))
	if err != nil {
		t.Fatal(err)
	}
	<-done
	// A nak with backoff redelivers after a second; an ack leaves nothing pending.
	time.Sleep(300 * time.Millisecond)
	stop()

	info, err := consumer.Info(ctx)
	if err != nil {
		t.Fatal(err)
	}
	return info.NumAckPending > 0 || info.NumPending > 0
}

// Returning nil acknowledges the message.
func TestHandleAcksOnSuccess(t *testing.T) {
	if deliver(t, func(context.Context, jetstream.Msg) error { return nil }) {
		t.Fatal("message was not acknowledged")
	}
}

// Terminate acknowledges too: the work will never succeed, so redelivering it
// only spends the consumer's attempts.
func TestHandleAcksOnTerminate(t *testing.T) {
	if deliver(t, func(context.Context, jetstream.Msg) error {
		return eipnats.Terminate("nothing here understands %s", "this")
	}) {
		t.Fatal("terminated message was left for redelivery")
	}
}

// An ordinary error leaves the message to be redelivered.
func TestHandleNacksOnError(t *testing.T) {
	if !deliver(t, func(context.Context, jetstream.Msg) error {
		return errors.New("transient")
	}) {
		t.Fatal("failed message was acknowledged")
	}
}

// A wrapped Terminate is still terminal, so a handler may add context to it.
func TestTerminateSurvivesWrapping(t *testing.T) {
	if deliver(t, func(context.Context, jetstream.Msg) error {
		return errors.Join(errors.New("context"), eipnats.Terminate("unroutable"))
	}) {
		t.Fatal("wrapped Terminate was treated as retryable")
	}
}

// A handler that reports its own outcome is not followed by a second, blander
// log line for the same message — but the message is still acknowledged.
func TestHandleLeavesOutcomeToAHandlerThatReportsOne(t *testing.T) {
	if deliver(t, func(ctx context.Context, msg jetstream.Msg) error {
		eipnats.FinishNATSConsumerOperation(ctx, "info", "handler reported this itself", map[string]any{
			"recipients": 3,
		})
		return nil
	}) {
		t.Fatal("message was not acknowledged")
	}
}
