package main

import (
	"context"
	"fmt"
	"time"

	natscore "eve-industry-planner/shared/core/nats"
	"eve-industry-planner/shared/shared/logs"
	esitasks "eve-industry-planner/worker/tasks/esi"

	"github.com/nats-io/nats.go/jetstream"
	antslib "github.com/panjf2000/ants/v2"
)

// TaskFunc is a function that processes a message
type TaskFunc func(msg jetstream.Msg, deps *esitasks.TaskDependencies)

// SubscriberConfig holds the configuration for a subscriber
type SubscriberConfig struct {
	Subject      string
	ConsumerName string
	StreamName   string
	TaskName     string // For logging purposes (e.g., "system indexes refresh", "adjusted prices refresh")
	TaskFunc     TaskFunc
}

// GroupedSubscriberConfig holds the configuration for a subscriber that handles multiple subjects
type GroupedSubscriberConfig struct {
	Subject      string // Wildcard subject like "task.scheduled>" or "task.auth>"
	ConsumerName string
	StreamName   string
	TaskName     string              // Group name for logging (e.g., "scheduled tasks", "auth tasks")
	TaskRoutes   map[string]TaskFunc // Map of specific subject to task function
}

// processWorkerMessage processes a single message by submitting it to the goroutine pool.
// Handles panic recovery and error handling for pool submission.
func processWorkerMessage(
	msg jetstream.Msg,
	taskFunc TaskFunc,
	taskName string,
	subject string,
	pool *antslib.Pool,
	deps *WorkerDependencies,
) {
	deliveryCount, sequence := natscore.GetMessageMetadata(msg)
	logs.Debug(fmt.Sprintf("received %s message", taskName), "subject", subject, "sequence", sequence, "delivery_count", deliveryCount)

	// Acknowledge message receipt immediately to prevent redelivery while waiting for pool
	natscore.InProgressMessage(msg)

	// Create task dependencies
	taskDeps := &esitasks.TaskDependencies{
		ServiceClients: deps.ServiceClients,
		ESIClient:      deps.ESIClient,
	}

	// Submit task to goroutine pool - will wait if pool is full
	err := pool.Submit(func() {
		// Recover from panics to ensure message is always acknowledged
		defer func() {
			if r := recover(); r != nil {
				logs.Error(fmt.Sprintf("panic in %s task", taskName), "error", r, "subject", subject, "sequence", sequence, "delivery_count", deliveryCount)
				// Nack the message on panic so it can be retried
				natscore.NackMessage(msg)
				logs.Info("message nacked after panic", "subject", subject, "sequence", sequence)
			}
		}()
		// Pass jetstream.Msg directly
		taskFunc(msg, taskDeps)
	})
	if err != nil {
		logs.Error("failed to submit task to pool", "subject", subject, "sequence", sequence, "error", err)
		// Nack the message if we can't process it
		natscore.NackMessage(msg)
		logs.Info("message nacked due to pool submission failure", "subject", subject, "sequence", sequence)
	}
}

// startWorkerMessageLoop starts a background goroutine that continuously fetches and processes messages
// from the given consumer using the worker's pool submission pattern.
func startWorkerMessageLoop(
	consumer jetstream.Consumer,
	processor func(msg jetstream.Msg),
	stopChan chan struct{},
	subject string,
) {
	logs.Info("starting message fetch loop", "subject", subject)
	go func() {
		for {
			select {
			case <-stopChan:
				logs.Info("message fetch loop stopped", "subject", subject)
				return
			default:
				// Fetch up to 10 messages at a time
				logs.Debug("fetching messages from NATS", "subject", subject)
				msgs, err := consumer.Fetch(10, jetstream.FetchMaxWait(5*time.Second))
				if err != nil {
					if err == context.DeadlineExceeded {
						// Reduce log noise - only log timeout occasionally
						logs.Debug("fetch timeout (no messages available)", "subject", subject)
						continue
					}
					logs.Error("failed to fetch messages", "subject", subject, "error", err)
					time.Sleep(time.Second)
					continue
				}

				msgCount := 0
				for msg := range msgs.Messages() {
					msgCount++
					actualSubject := msg.Subject()
					_, sequence := natscore.GetMessageMetadata(msg)
					logs.Debug("processing message from fetch", "subject", subject, "actual_subject", actualSubject, "sequence", sequence)
					processor(msg)
				}
				if msgCount > 0 {
					logs.Debug("fetched batch of messages", "subject", subject, "count", msgCount, "messages_processed", msgCount)
				} else {
					logs.Debug("fetch returned but no messages in batch", "subject", subject)
				}
			}
		}
	}()
}

// SubscribeToSubject sets up a JetStream pull consumer for a specific subject.
// Returns a cleanup function and an error if subscription fails.
func SubscribeToSubject(deps *WorkerDependencies, config SubscriberConfig) (func(context.Context), error) {
	ctx := context.Background()

	// Get or ensure the stream exists
	stream, err := natscore.GetOrEnsureStream(ctx, deps.JetStream, natscore.EnsureWorkerTaskStream, config.StreamName)
	if err != nil {
		return nil, fmt.Errorf("failed to get or ensure stream: %w", err)
	}

	// Create or get durable consumer
	// Use DeliverLastPolicy to only get new messages, avoiding reprocessing old messages on startup
	// FilterSubject ensures this consumer only receives messages for its specific subject
	consumerConfig := jetstream.ConsumerConfig{
		Durable:       config.ConsumerName,
		FilterSubject: config.Subject,
		DeliverPolicy: jetstream.DeliverLastPolicy,
		AckPolicy:     jetstream.AckExplicitPolicy,
		AckWait:       30 * time.Second,
		MaxDeliver:    5,
	}

	consumer, err := natscore.GetOrCreateConsumer(ctx, stream, consumerConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to create consumer: %w", err)
	}

	// Create message processor that submits to pool
	processor := func(msg jetstream.Msg) {
		processWorkerMessage(msg, config.TaskFunc, config.TaskName, config.Subject, deps.Pool, deps)
	}

	// Start message processing loop
	stopChan := make(chan struct{})
	startWorkerMessageLoop(consumer, processor, stopChan, config.Subject)

	logs.Debug(fmt.Sprintf("subscribed to %s", config.TaskName), "subject", config.Subject, "consumer", config.ConsumerName, "type", "pull")

	cleanup := func(ctx context.Context) {
		close(stopChan)
		// Messages channel will be closed, processing will stop
	}

	return cleanup, nil
}

// SubscribeToSubjectGroup sets up a JetStream pull consumer for a wildcard subject group.
// Messages are routed to the appropriate task function based on their actual subject.
// Returns a cleanup function and an error if subscription fails.
func SubscribeToSubjectGroup(deps *WorkerDependencies, config GroupedSubscriberConfig) (func(context.Context), error) {
	ctx := context.Background()

	// Get or ensure the stream exists
	stream, err := natscore.GetOrEnsureStream(ctx, deps.JetStream, natscore.EnsureWorkerTaskStream, config.StreamName)
	if err != nil {
		return nil, fmt.Errorf("failed to get or ensure stream: %w", err)
	}

	// Create or get durable consumer
	// Use DeliverLastPolicy to only get new messages, avoiding reprocessing old messages on startup
	// FilterSubject uses wildcard pattern to match all subjects in the group
	consumerConfig := jetstream.ConsumerConfig{
		Durable:       config.ConsumerName,
		FilterSubject: config.Subject,
		DeliverPolicy: jetstream.DeliverLastPolicy,
		AckPolicy:     jetstream.AckExplicitPolicy,
		AckWait:       30 * time.Second,
		MaxDeliver:    5,
	}

	consumer, err := natscore.GetOrCreateConsumer(ctx, stream, consumerConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to create consumer: %w", err)
	}

	// Create message processor that routes to appropriate task function
	processor := func(msg jetstream.Msg) {
		actualSubject := msg.Subject()
		_, sequence := natscore.GetMessageMetadata(msg)
		logs.Info("message received in subscriber processor", "subject", actualSubject, "group", config.TaskName, "sequence", sequence, "available_routes", len(config.TaskRoutes))

		// Find the appropriate task function for this subject
		taskFunc, exists := config.TaskRoutes[actualSubject]
		if !exists {
			logs.Warn("no task handler found for subject", "subject", actualSubject, "group", config.TaskName, "sequence", sequence)
			// Ack the message even though we don't have a handler, to prevent redelivery
			deliveryCount := natscore.GetDeliveryCount(msg)
			natscore.AcknowledgeMessage(msg, "no handler found", deliveryCount)
			return
		}

		logs.Info("routing message to task handler", "subject", actualSubject, "group", config.TaskName, "sequence", sequence)
		// Process the message using the worker message processing helper
		processWorkerMessage(msg, taskFunc, config.TaskName, actualSubject, deps.Pool, deps)
	}

	// Start message processing loop
	stopChan := make(chan struct{})
	startWorkerMessageLoop(consumer, processor, stopChan, config.Subject)

	logs.Debug(fmt.Sprintf("subscribed to %s", config.TaskName), "subject", config.Subject, "consumer", config.ConsumerName, "type", "pull")

	cleanup := func(ctx context.Context) {
		close(stopChan)
		// Messages channel will be closed, processing will stop
	}

	return cleanup, nil
}
