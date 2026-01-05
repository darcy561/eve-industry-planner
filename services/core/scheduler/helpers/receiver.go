package helpers

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	natscore "eve-industry-planner/shared/core/nats"

	"github.com/nats-io/nats.go/jetstream"
)

// SetupScheduleRequestReceiver sets up a JetStream consumer to receive schedule request messages.
// Returns the consumer and starts a background goroutine for message processing.
func SetupScheduleRequestReceiver(
	js jetstream.JetStream,
	log *slog.Logger,
	processMessage func(msg jetstream.Msg),
	stopChan chan struct{},
) (jetstream.Consumer, error) {
	ctx := context.Background()
	subject := natscore.SubjectSchedulerSchedule
	streamName := natscore.SchedulerStream
	consumerName := natscore.ConsumerScheduler

	// Get or ensure the stream exists (accepts all scheduler.* subjects)
	stream, err := natscore.GetOrEnsureStream(ctx, js, natscore.EnsureSchedulerStream, streamName)
	if err != nil {
		return nil, fmt.Errorf("failed to get or ensure scheduler stream: %w", err)
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

	consumer, err := natscore.GetOrCreateConsumer(ctx, stream, consumerConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to create scheduler consumer: %w", err)
	}

	log.Debug("scheduler consumer setup", "subject", subject, "consumer", consumerName, "stream", streamName)

	// Start message processing loop in background
	natscore.StartMessageProcessingLoop(consumer, processMessage, stopChan, subject)

	return consumer, nil
}

