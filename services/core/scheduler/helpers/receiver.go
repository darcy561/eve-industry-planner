package helpers

import (
	"context"
	"fmt"
	"time"

	"eve-industry-planner/shared/logs"
	eipnats "eve-industry-planner/shared/nats"

	"github.com/nats-io/nats.go/jetstream"
)

const schedulerLogComponent = "scheduler"

// SetupScheduleRequestReceiver sets up a JetStream consumer to receive schedule request messages.
// Returns the consumer and starts a background goroutine for message processing.
func SetupScheduleRequestReceiver(
	natsHandle *eipnats.NATS,
	processMessage func(msg jetstream.Msg),
	stopChan chan struct{},
) (jetstream.Consumer, error) {
	ctx := context.Background()
	subject := eipnats.SubjectSchedulerSchedule
	consumerName := eipnats.ConsumerScheduler

	scheduler := natsHandle.Scheduler
	if _, err := scheduler.Ensure(ctx); err != nil {
		return nil, fmt.Errorf("failed to ensure scheduler stream: %w", err)
	}

	if _, err := scheduler.Reconcile(ctx); err != nil {
		logs.WarnCtx(ctx, "scheduler stream consumer reconcile failed", "component", schedulerLogComponent, "error", err)
	}

	// Create or get durable consumer
	// Use DeliverAllPolicy to get all messages including those published while scheduler was down
	// FilterSubject filters to only receive messages for the specific subject (stream accepts all scheduler.*)
	consumerConfig := jetstream.ConsumerConfig{
		Durable:       consumerName,
		FilterSubject: subject,
		DeliverPolicy: jetstream.DeliverAllPolicy,
		AckPolicy:     jetstream.AckExplicitPolicy,
		AckWait:       30 * time.Second,
		MaxDeliver:    5,
	}

	consumer, err := scheduler.Consumer(ctx, consumerConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to create scheduler consumer: %w", err)
	}

	logs.DebugCtx(ctx, "scheduler consumer setup", "component", schedulerLogComponent,
		"subject", subject, "consumer", consumerName, "stream", scheduler.Spec().Name)

	// Start message processing loop in background
	if err := eipnats.ConsumeUntil(consumer, subject, processMessage, stopChan); err != nil {
		return nil, err
	}

	return consumer, nil
}
