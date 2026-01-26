package main

import (
	"context"
	"fmt"
	"sync"
	"time"

	natscore "eve-industry-planner/shared/core/nats"
	"eve-industry-planner/shared/shared/logs"
	asynqpkg "eve-industry-planner/worker/asynq"

	"github.com/hibiken/asynq"
	"github.com/nats-io/nats.go/jetstream"
)

const (
	// MessageFetchBatchSize is the number of messages to fetch per batch
	MessageFetchBatchSize = 50
	// MessageFetchMaxWait is the maximum time to wait for messages when fetching
	MessageFetchMaxWait = 2 * time.Second
	// MessageFetchIdleWait is the time to wait when no messages are available
	MessageFetchIdleWait = 100 * time.Millisecond
	// MaxConcurrentEnqueues limits concurrent enqueue operations per batch
	// This prevents overwhelming asynq clients while still allowing parallelism
	MaxConcurrentEnqueues = 20
)

// SubscriberConfig holds the configuration for a subscriber
type SubscriberConfig struct {
	Subject      string
	ConsumerName string
	StreamName   string
	TaskName     string // For logging purposes (e.g., "system indexes refresh", "adjusted prices refresh")
}

// GroupedSubscriberConfig holds the configuration for a subscriber that handles multiple subjects
type GroupedSubscriberConfig struct {
	Subject      string // Wildcard subject like "task.scheduled>" or "task.auth>"
	ConsumerName string
	StreamName   string
	TaskName     string   // Group name for logging (e.g., "scheduled tasks", "auth tasks")
	TaskRoutes   []string // List of subjects this subscriber handles (for routing to asynq)
}

// processMessage receives a NATS message and enqueues it to the asynq server.
// Acknowledges NATS message immediately after successful enqueue to prevent redelivery.
func processMessage(
	msg jetstream.Msg,
	subject string,
	client *asynq.Client,
) {
	// Determine task type from subject
	taskType := getTaskTypeFromSubject(subject)
	if taskType == "" {
		deliveryCount, _ := natscore.GetMessageMetadata(msg)
		logs.Warn("unknown task type for subject", "subject", subject)
		natscore.AcknowledgeMessage(msg, "unknown task type", deliveryCount)
		return
	}

	// Enqueue to asynq server
	// This is fast and non-blocking - asynq server handles processing with priority queues
	err := asynqpkg.Enqueue(msg, client, taskType, subject)
	if err != nil {
		logs.Error("failed to enqueue task to asynq", "subject", subject, "error", err)
		// Nack the message so it can be retried
		natscore.NackMessage(msg)
		return
	}

	// Acknowledge NATS message immediately after successful enqueue
	// Message is now safely in asynq queue with retention, won't expire
	deliveryCount, _ := natscore.GetMessageMetadata(msg)
	natscore.AcknowledgeMessage(msg, "enqueued to asynq", deliveryCount)
}

// getTaskTypeFromSubject maps NATS subject to asynq task type
func getTaskTypeFromSubject(subject string) string {
	switch subject {
	case natscore.SubjectRefreshSystemIndexes:
		return "refreshSystemIndexes"
	case natscore.SubjectRefreshAdjustedPrices:
		return "refreshAdjustedPrices"
	case natscore.SubjectRefreshMarketPrices, natscore.SubjectFetchMissingMarketPrices:
		return "refreshMarketPrices" // Both subjects use the same task handler
	case natscore.SubjectFetchCorporations:
		return "fetchCorporations"
	default:
		return ""
	}
}

// startMessageLoop starts a background goroutine that continuously fetches and processes messages.
func startMessageLoop(
	consumer jetstream.Consumer,
	processor func(msg jetstream.Msg),
	stopChan chan struct{},
	subject string,
) {
	logs.Debug("starting message fetch loop", "subject", subject, "batch_size", MessageFetchBatchSize, "max_concurrent", MaxConcurrentEnqueues)
	go func() {
		consecutiveEmptyFetches := 0
		for {
			select {
			case <-stopChan:
				logs.Info("message fetch loop stopped", "subject", subject)
				return
			default:
				// Fetch messages in larger batches for better throughput
				msgs, err := consumer.Fetch(MessageFetchBatchSize, jetstream.FetchMaxWait(MessageFetchMaxWait))
				if err != nil {
					if err == context.DeadlineExceeded {
						consecutiveEmptyFetches++
						// Reduce log noise - only log every 50 empty fetches
						if consecutiveEmptyFetches%50 == 0 {
							logs.Debug("fetch timeout (no messages available)", "subject", subject, "consecutive_empty", consecutiveEmptyFetches)
						}
						// Short sleep when idle to reduce CPU usage
						time.Sleep(MessageFetchIdleWait)
						continue
					}
					logs.Error("failed to fetch messages", "subject", subject, "error", err)
					time.Sleep(time.Second)
					continue
				}

				// Collect all messages from the channel first
				var messageBatch []jetstream.Msg
				for msg := range msgs.Messages() {
					messageBatch = append(messageBatch, msg)
				}

				msgCount := len(messageBatch)
				if msgCount == 0 {
					consecutiveEmptyFetches++
					continue
				}

				// Reset empty fetch counter when we get messages
				consecutiveEmptyFetches = 0

				// Process messages in parallel with controlled concurrency
				// This significantly improves throughput while preventing resource exhaustion
				processBatchInParallel(messageBatch, processor)

				// Log batch summary (reduced logging overhead)
				logs.Debug("processed message batch", "subject", subject, "count", msgCount)
			}
		}
	}()
}

// processBatchInParallel processes a batch of messages concurrently with controlled concurrency.
// Uses a semaphore pattern to limit concurrent enqueue operations.
func processBatchInParallel(
	messages []jetstream.Msg,
	processor func(msg jetstream.Msg),
) {
	if len(messages) == 0 {
		return
	}

	// Use a semaphore to limit concurrent enqueue operations
	sem := make(chan struct{}, MaxConcurrentEnqueues)
	var wg sync.WaitGroup

	for _, msg := range messages {
		wg.Add(1)
		// Acquire semaphore (blocks if at capacity)
		sem <- struct{}{}

		go func(m jetstream.Msg) {
			defer wg.Done()
			defer func() { <-sem }() // Release semaphore

			// Process message - enqueues to asynq and acknowledges NATS immediately
			// asynq handles processing with strict priority ordering
			processor(m)
		}(msg)
	}

	// Wait for all messages in the batch to be processed
	wg.Wait()
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

	// Create or get durable consumer for messages
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

	// Create message processor that enqueues to asynq server
	processor := func(msg jetstream.Msg) {
		processMessage(msg, config.Subject, deps.AsynqClient)
	}

	// Start message processing loop
	stopChan := make(chan struct{})
	startMessageLoop(consumer, processor, stopChan, config.Subject)

	logs.Debug(fmt.Sprintf("subscribed to %s", config.TaskName), "subject", config.Subject, "consumer", config.ConsumerName, "type", "pull")

	cleanup := func(ctx context.Context) {
		close(stopChan)
		// Messages channel will be closed, processing will stop
	}

	return cleanup, nil
}

// SubscribeToSubjectGroup sets up a JetStream pull consumer for a wildcard subject group.
// Returns a cleanup function and an error if subscription fails.
func SubscribeToSubjectGroup(deps *WorkerDependencies, config GroupedSubscriberConfig) (func(context.Context), error) {
	ctx := context.Background()

	// Get or ensure the stream exists
	stream, err := natscore.GetOrEnsureStream(ctx, deps.JetStream, natscore.EnsureWorkerTaskStream, config.StreamName)
	if err != nil {
		return nil, fmt.Errorf("failed to get or ensure stream: %w", err)
	}

	// Create or get durable consumer for messages
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

	// Build a map for O(1) subject lookup instead of O(n) linear search
	validRoutes := make(map[string]bool, len(config.TaskRoutes))
	for _, route := range config.TaskRoutes {
		validRoutes[route] = true
	}

	// Create message processor that routes to asynq server
	processor := func(msg jetstream.Msg) {
		actualSubject := msg.Subject()

		// Fast O(1) lookup instead of O(n) linear search
		if !validRoutes[actualSubject] {
			// Ack the message even though we don't have a handler, to prevent redelivery
			deliveryCount := natscore.GetDeliveryCount(msg)
			natscore.AcknowledgeMessage(msg, "no handler found", deliveryCount)
			return
		}

		// Process the message using the message processing helper
		processMessage(msg, actualSubject, deps.AsynqClient)
	}

	// Start message processing loop
	stopChan := make(chan struct{})
	startMessageLoop(consumer, processor, stopChan, config.Subject)

	logs.Debug(fmt.Sprintf("subscribed to %s", config.TaskName), "subject", config.Subject, "consumer", config.ConsumerName, "type", "pull")

	cleanup := func(ctx context.Context) {
		close(stopChan)
		// Messages channel will be closed, processing will stop
	}

	return cleanup, nil
}

// SubscribeScheduledTasks sets up JetStream pull consumers for all scheduled tasks.
// Task priority is determined by GetPriorityQueue() routing, not by subscription order.
// Returns a cleanup function and an error if subscription fails.
func SubscribeScheduledTasks(deps *WorkerDependencies) (func(context.Context), error) {
	cleanups := []func(context.Context){}

	// Corporation claims
	cleanup1, err := SubscribeToSubject(deps, SubscriberConfig{
		Subject:      natscore.SubjectFetchCorporations,
		ConsumerName: "task-scheduled-corporation-claims",
		StreamName:   natscore.WorkerTaskStream,
		TaskName:     "corporation claims",
	})
	if err != nil {
		return nil, err
	}
	cleanups = append(cleanups, cleanup1)

	// System indexes
	cleanup2, err := SubscribeToSubject(deps, SubscriberConfig{
		Subject:      natscore.SubjectRefreshSystemIndexes,
		ConsumerName: "task-scheduled-system-indexes",
		StreamName:   natscore.WorkerTaskStream,
		TaskName:     "system indexes refresh",
	})
	if err != nil {
		return nil, err
	}
	cleanups = append(cleanups, cleanup2)

	// Adjusted prices
	cleanup3, err := SubscribeToSubject(deps, SubscriberConfig{
		Subject:      natscore.SubjectRefreshAdjustedPrices,
		ConsumerName: "task-scheduled-adjusted-prices",
		StreamName:   natscore.WorkerTaskStream,
		TaskName:     "adjusted prices refresh",
	})
	if err != nil {
		return nil, err
	}
	cleanups = append(cleanups, cleanup3)

	// Missing market prices
	cleanup4, err := SubscribeToSubject(deps, SubscriberConfig{
		Subject:      natscore.SubjectFetchMissingMarketPrices,
		ConsumerName: "task-missing-market-prices",
		StreamName:   natscore.WorkerTaskStream,
		TaskName:     "fetch missing market prices",
	})
	if err != nil {
		return nil, err
	}
	cleanups = append(cleanups, cleanup4)

	// Market prices refresh
	cleanup5, err := SubscribeToSubject(deps, SubscriberConfig{
		Subject:      natscore.SubjectRefreshMarketPrices,
		ConsumerName: "task-scheduled-market-prices",
		StreamName:   natscore.WorkerTaskStream,
		TaskName:     "market prices refresh",
	})
	if err != nil {
		return nil, err
	}
	cleanups = append(cleanups, cleanup5)

	// Return combined cleanup function
	return func(ctx context.Context) {
		for _, cleanup := range cleanups {
			cleanup(ctx)
		}
	}, nil
}
