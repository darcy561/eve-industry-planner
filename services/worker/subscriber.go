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

// processESIMessage receives an ESI NATS message and enqueues it to the ESI asynq server.
// Acknowledges NATS message immediately after successful enqueue to prevent redelivery.
// This is the ESI message processor - completely independent from regular message processing.
func processESIMessage(
	msg jetstream.Msg,
	subject string,
	esiClient *asynq.Client,
) {
	// Determine task type from subject
	taskType := getESITaskTypeFromSubject(subject)
	if taskType == "" {
		deliveryCount, _ := natscore.GetMessageMetadata(msg)
		logs.Warn("unknown ESI task type for subject", "subject", subject)
		natscore.AcknowledgeMessage(msg, "unknown ESI task type", deliveryCount)
		return
	}

	// Enqueue to ESI asynq server only
	// This is fast and non-blocking - ESI asynq server handles processing with strict priority
	err := asynqpkg.EnqueueESI(msg, esiClient, taskType, subject)
	if err != nil {
		logs.Error("failed to enqueue ESI task to asynq", "subject", subject, "error", err)
		// Nack the message so it can be retried
		natscore.NackMessage(msg)
		return
	}

	// Acknowledge NATS message immediately after successful enqueue
	// Message is now safely in ESI asynq queue with retention, won't expire
	deliveryCount, _ := natscore.GetMessageMetadata(msg)
	natscore.AcknowledgeMessage(msg, "enqueued to ESI asynq", deliveryCount)
}

// processRegularMessage receives a regular NATS message and enqueues it to the regular asynq server.
// Acknowledges NATS message immediately after successful enqueue to prevent redelivery.
// This is the regular message processor - completely independent from ESI message processing.
func processRegularMessage(
	msg jetstream.Msg,
	subject string,
	regularClient *asynq.Client,
) {
	// Determine task type from subject
	taskType := getRegularTaskTypeFromSubject(subject)
	if taskType == "" {
		deliveryCount, _ := natscore.GetMessageMetadata(msg)
		logs.Warn("unknown regular task type for subject", "subject", subject)
		natscore.AcknowledgeMessage(msg, "unknown regular task type", deliveryCount)
		return
	}

	// Enqueue to regular asynq server only
	// This is fast and non-blocking - regular asynq server handles processing with strict priority
	err := asynqpkg.EnqueueRegular(msg, regularClient, taskType, subject)
	if err != nil {
		logs.Error("failed to enqueue regular task to asynq", "subject", subject, "error", err)
		// Nack the message so it can be retried
		natscore.NackMessage(msg)
		return
	}

	// Acknowledge NATS message immediately after successful enqueue
	// Message is now safely in regular asynq queue with retention, won't expire
	deliveryCount, _ := natscore.GetMessageMetadata(msg)
	natscore.AcknowledgeMessage(msg, "enqueued to regular asynq", deliveryCount)
}

// getESITaskTypeFromSubject maps ESI NATS subject to asynq task type
func getESITaskTypeFromSubject(subject string) string {
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

// getRegularTaskTypeFromSubject maps regular NATS subject to asynq task type
func getRegularTaskTypeFromSubject(subject string) string {
	// No regular tasks currently - all tasks use ESI rate limiter
	return ""
}

// startESIMessageLoop starts a background goroutine that continuously fetches and processes ESI messages.
// This is the ESI message service - completely independent from regular message processing.
func startESIMessageLoop(
	consumer jetstream.Consumer,
	processor func(msg jetstream.Msg),
	stopChan chan struct{},
	subject string,
) {
	logs.Debug("starting ESI message fetch loop", "subject", subject, "batch_size", MessageFetchBatchSize, "max_concurrent", MaxConcurrentEnqueues, "service", "esi")
	go func() {
		consecutiveEmptyFetches := 0
		for {
			select {
			case <-stopChan:
				logs.Info("ESI message fetch loop stopped", "subject", subject)
				return
			default:
				// Fetch messages in larger batches for better throughput
				msgs, err := consumer.Fetch(MessageFetchBatchSize, jetstream.FetchMaxWait(MessageFetchMaxWait))
				if err != nil {
					if err == context.DeadlineExceeded {
						consecutiveEmptyFetches++
						// Reduce log noise - only log every 50 empty fetches
						if consecutiveEmptyFetches%50 == 0 {
							logs.Debug("ESI fetch timeout (no messages available)", "subject", subject, "consecutive_empty", consecutiveEmptyFetches)
						}
						// Short sleep when idle to reduce CPU usage
						time.Sleep(MessageFetchIdleWait)
						continue
					}
					logs.Error("failed to fetch ESI messages", "subject", subject, "error", err)
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
				logs.Debug("processed ESI message batch", "subject", subject, "count", msgCount)
			}
		}
	}()
}

// startRegularMessageLoop starts a background goroutine that continuously fetches and processes regular messages.
// This is the regular message service - completely independent from ESI message processing.
func startRegularMessageLoop(
	consumer jetstream.Consumer,
	processor func(msg jetstream.Msg),
	stopChan chan struct{},
	subject string,
) {
	logs.Info("starting regular message fetch loop", "subject", subject, "batch_size", MessageFetchBatchSize, "max_concurrent", MaxConcurrentEnqueues, "service", "regular")
	go func() {
		consecutiveEmptyFetches := 0
		for {
			select {
			case <-stopChan:
				logs.Info("regular message fetch loop stopped", "subject", subject)
				return
			default:
				// Fetch messages in larger batches for better throughput
				msgs, err := consumer.Fetch(MessageFetchBatchSize, jetstream.FetchMaxWait(MessageFetchMaxWait))
				if err != nil {
					if err == context.DeadlineExceeded {
						consecutiveEmptyFetches++
						// Reduce log noise - only log every 50 empty fetches
						if consecutiveEmptyFetches%50 == 0 {
							logs.Debug("regular fetch timeout (no messages available)", "subject", subject, "consecutive_empty", consecutiveEmptyFetches)
						}
						// Short sleep when idle to reduce CPU usage
						time.Sleep(MessageFetchIdleWait)
						continue
					}
					logs.Error("failed to fetch regular messages", "subject", subject, "error", err)
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
				logs.Debug("processed regular message batch", "subject", subject, "count", msgCount)
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

// SubscribeToESISubject sets up a JetStream pull consumer for a specific ESI subject.
// This is the ESI subscriber service - completely independent from regular message processing.
// Returns a cleanup function and an error if subscription fails.
func SubscribeToESISubject(deps *WorkerDependencies, config SubscriberConfig) (func(context.Context), error) {
	ctx := context.Background()

	// Get or ensure the stream exists
	stream, err := natscore.GetOrEnsureStream(ctx, deps.JetStream, natscore.EnsureWorkerTaskStream, config.StreamName)
	if err != nil {
		return nil, fmt.Errorf("failed to get or ensure stream: %w", err)
	}

	// Create or get durable consumer for ESI messages
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
		return nil, fmt.Errorf("failed to create ESI consumer: %w", err)
	}

	// Create ESI message processor that enqueues to ESI asynq server only
	processor := func(msg jetstream.Msg) {
		processESIMessage(msg, config.Subject, deps.ESIAsynqClient)
	}

	// Start ESI message processing loop
	stopChan := make(chan struct{})
	startESIMessageLoop(consumer, processor, stopChan, config.Subject)

	logs.Debug(fmt.Sprintf("subscribed to ESI %s", config.TaskName), "subject", config.Subject, "consumer", config.ConsumerName, "type", "pull", "service", "esi")

	cleanup := func(ctx context.Context) {
		close(stopChan)
		// Messages channel will be closed, processing will stop
	}

	return cleanup, nil
}

// SubscribeToRegularSubject sets up a JetStream pull consumer for a specific regular subject.
// This is the regular subscriber service - completely independent from ESI message processing.
// Returns a cleanup function and an error if subscription fails.
func SubscribeToRegularSubject(deps *WorkerDependencies, config SubscriberConfig) (func(context.Context), error) {
	ctx := context.Background()

	// Get or ensure the stream exists
	stream, err := natscore.GetOrEnsureStream(ctx, deps.JetStream, natscore.EnsureWorkerTaskStream, config.StreamName)
	if err != nil {
		return nil, fmt.Errorf("failed to get or ensure stream: %w", err)
	}

	// Create or get durable consumer for regular messages
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
		return nil, fmt.Errorf("failed to create regular consumer: %w", err)
	}

	// Create regular message processor that enqueues to regular asynq server only
	processor := func(msg jetstream.Msg) {
		processRegularMessage(msg, config.Subject, deps.RegularClient)
	}

	// Start regular message processing loop
	stopChan := make(chan struct{})
	startRegularMessageLoop(consumer, processor, stopChan, config.Subject)

	logs.Debug(fmt.Sprintf("subscribed to regular %s", config.TaskName), "subject", config.Subject, "consumer", config.ConsumerName, "type", "pull", "service", "regular")

	cleanup := func(ctx context.Context) {
		close(stopChan)
		// Messages channel will be closed, processing will stop
	}

	return cleanup, nil
}

// SubscribeToESISubjectGroup sets up a JetStream pull consumer for a wildcard ESI subject group.
// This is the ESI grouped subscriber service - completely independent from regular message processing.
// Returns a cleanup function and an error if subscription fails.
func SubscribeToESISubjectGroup(deps *WorkerDependencies, config GroupedSubscriberConfig) (func(context.Context), error) {
	ctx := context.Background()

	// Get or ensure the stream exists
	stream, err := natscore.GetOrEnsureStream(ctx, deps.JetStream, natscore.EnsureWorkerTaskStream, config.StreamName)
	if err != nil {
		return nil, fmt.Errorf("failed to get or ensure stream: %w", err)
	}

	// Create or get durable consumer for ESI messages
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
		return nil, fmt.Errorf("failed to create ESI consumer: %w", err)
	}

	// Build a map for O(1) subject lookup instead of O(n) linear search
	validRoutes := make(map[string]bool, len(config.TaskRoutes))
	for _, route := range config.TaskRoutes {
		validRoutes[route] = true
	}

	// Create ESI message processor that routes to ESI asynq server only
	processor := func(msg jetstream.Msg) {
		actualSubject := msg.Subject()

		// Fast O(1) lookup instead of O(n) linear search
		if !validRoutes[actualSubject] {
			// Ack the message even though we don't have a handler, to prevent redelivery
			deliveryCount := natscore.GetDeliveryCount(msg)
			natscore.AcknowledgeMessage(msg, "no ESI handler found", deliveryCount)
			return
		}

		// Process the message using the ESI message processing helper
		processESIMessage(msg, actualSubject, deps.ESIAsynqClient)
	}

	// Start ESI message processing loop
	stopChan := make(chan struct{})
	startESIMessageLoop(consumer, processor, stopChan, config.Subject)

	logs.Debug(fmt.Sprintf("subscribed to ESI %s", config.TaskName), "subject", config.Subject, "consumer", config.ConsumerName, "type", "pull", "service", "esi")

	cleanup := func(ctx context.Context) {
		close(stopChan)
		// Messages channel will be closed, processing will stop
	}

	return cleanup, nil
}

// SubscribeToRegularSubjectGroup sets up a JetStream pull consumer for a wildcard regular subject group.
// This is the regular grouped subscriber service - completely independent from ESI message processing.
// Returns a cleanup function and an error if subscription fails.
func SubscribeToRegularSubjectGroup(deps *WorkerDependencies, config GroupedSubscriberConfig) (func(context.Context), error) {
	ctx := context.Background()

	// Get or ensure the stream exists
	stream, err := natscore.GetOrEnsureStream(ctx, deps.JetStream, natscore.EnsureWorkerTaskStream, config.StreamName)
	if err != nil {
		return nil, fmt.Errorf("failed to get or ensure stream: %w", err)
	}

	// Create or get durable consumer for regular messages
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
		return nil, fmt.Errorf("failed to create regular consumer: %w", err)
	}

	// Build a map for O(1) subject lookup instead of O(n) linear search
	validRoutes := make(map[string]bool, len(config.TaskRoutes))
	for _, route := range config.TaskRoutes {
		validRoutes[route] = true
	}

	// Create regular message processor that routes to regular asynq server only
	processor := func(msg jetstream.Msg) {
		actualSubject := msg.Subject()

		// Fast O(1) lookup instead of O(n) linear search
		if !validRoutes[actualSubject] {
			// Ack the message even though we don't have a handler, to prevent redelivery
			deliveryCount := natscore.GetDeliveryCount(msg)
			natscore.AcknowledgeMessage(msg, "no regular handler found", deliveryCount)
			return
		}

		// Process the message using the regular message processing helper
		processRegularMessage(msg, actualSubject, deps.RegularClient)
	}

	// Start regular message processing loop
	stopChan := make(chan struct{})
	startRegularMessageLoop(consumer, processor, stopChan, config.Subject)

	logs.Debug(fmt.Sprintf("subscribed to regular %s", config.TaskName), "subject", config.Subject, "consumer", config.ConsumerName, "type", "pull", "service", "regular")

	cleanup := func(ctx context.Context) {
		close(stopChan)
		// Messages channel will be closed, processing will stop
	}

	return cleanup, nil
}
