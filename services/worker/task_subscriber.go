package main

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	natscore "eve-industry-planner/shared/core/nats"
	"eve-industry-planner/shared/logs"
	asynqpkg "eve-industry-planner/worker/asynq"

	"github.com/hibiken/asynq"
	"github.com/nats-io/nats.go/jetstream"
)

const workerNatsTracerName = "eve-industry-planner/worker/nats"

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

// processMessage receives a NATS message and enqueues it to the asynq server.
// Acknowledges NATS message immediately after successful enqueue to prevent redelivery.
func processMessage(
	msg jetstream.Msg,
	subject string,
	client *asynq.Client,
) {
	var envelope natscore.Message
	_ = json.Unmarshal(msg.Data(), &envelope)

	ctx, endSpan := natscore.BeginConsumerContext(
		context.Background(),
		workerNatsTracerName,
		"nats.enqueue_task",
		msg,
		&envelope,
	)
	defer endSpan()

	// Determine task type from subject
	taskType := getTaskTypeFromSubject(subject)
	if taskType == "" {
		deliveryCount, _ := natscore.GetMessageMetadata(msg)
		natscore.FinishNATSConsumerOperation(ctx, "warn", "nats task rejected", map[string]interface{}{
			"subject": subject,
			"reason":  "unknown task type",
		})
		natscore.AcknowledgeMessage(msg, "unknown task type", deliveryCount)
		return
	}

	// Enqueue to asynq server
	// This is fast and non-blocking - asynq server handles processing with priority queues
	err := asynqpkg.Enqueue(msg, client, taskType, subject)
	if err != nil {
		logs.ErrorCtx(ctx, "failed to enqueue task to asynq", "subject", subject, "error", err)
		natscore.FinishNATSConsumerOperation(ctx, "warn", "nats task enqueue failed", map[string]interface{}{
			"subject":   subject,
			"task_type": taskType,
			"error":     err.Error(),
		})
		// Nack the message so it can be retried
		natscore.NackMessage(msg)
		return
	}

	// Acknowledge NATS message immediately after successful enqueue
	// Message is now safely in asynq queue with retention, won't expire
	deliveryCount, _ := natscore.GetMessageMetadata(msg)
	natscore.AcknowledgeMessage(msg, "enqueued to asynq", deliveryCount)
	natscore.FinishNATSConsumerOperation(ctx, "debug", "nats task enqueued", map[string]interface{}{
		"subject":   subject,
		"task_type": taskType,
	})
}

// getTaskTypeFromSubject derives the asynq task type from the NATS subject.
// Any subject starting with the task prefix (task.) uses the last segment as the task type.
// Example: task.scheduled.refreshSystemIndexes -> refreshSystemIndexes, task.migration.migrateUserDocumentToMongo -> migrateUserDocumentToMongo
func getTaskTypeFromSubject(subject string) string {
	if !strings.HasPrefix(subject, natscore.TaskSubjectPrefix) {
		return ""
	}
	after := strings.TrimPrefix(subject, natscore.TaskSubjectPrefix)
	if after == "" {
		return ""
	}
	if idx := strings.LastIndex(after, "."); idx >= 0 {
		return after[idx+1:]
	}
	return after
}

// startMessageLoop starts a background goroutine that continuously fetches and processes messages.
func startMessageLoop(
	consumer jetstream.Consumer,
	processor func(msg jetstream.Msg),
	stopChan chan struct{},
	subject string,
	loopCtx context.Context,
) {
	logs.DebugCtx(loopCtx, "starting message fetch loop", "subject", subject, "batch_size", MessageFetchBatchSize, "max_concurrent", MaxConcurrentEnqueues)
	go func() {
		consecutiveEmptyFetches := 0
		for {
			select {
			case <-stopChan:
				logs.InfoCtx(loopCtx, "message fetch loop stopped", "subject", subject)
				return
			default:
				// Fetch messages in larger batches for better throughput
				msgs, err := consumer.Fetch(MessageFetchBatchSize, jetstream.FetchMaxWait(MessageFetchMaxWait))
				if err != nil {
					if err == context.DeadlineExceeded {
						consecutiveEmptyFetches++
						// Reduce log noise - only log every 50 empty fetches
						if consecutiveEmptyFetches%50 == 0 {
							logs.DebugCtx(loopCtx, "fetch timeout (no messages available)", "subject", subject, "consecutive_empty", consecutiveEmptyFetches)
						}
						// Short sleep when idle to reduce CPU usage
						time.Sleep(MessageFetchIdleWait)
						continue
					}
					logs.ErrorCtx(loopCtx, "failed to fetch messages", "subject", subject, "error", err)
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
				logs.DebugCtx(loopCtx, "processed message batch", "subject", subject, "count", msgCount)
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

// SubscribeScheduledTasks sets up a single JetStream pull consumer for all tasks (task.>).
// Any message whose subject starts with the task prefix is accepted and queued; task type is derived
// from the subject (last segment), and priority from GetPriorityQueue(subject).
// Returns a cleanup function and an error if subscription fails.
func SubscribeScheduledTasks(deps *WorkerDependencies) (func(context.Context), error) {
	ctx := context.Background()

	stream, err := natscore.GetOrEnsureStream(ctx, deps.JetStream, natscore.EnsureWorkerTaskStream, natscore.WorkerTaskStream)
	if err != nil {
		return nil, fmt.Errorf("failed to get or ensure stream: %w", err)
	}

	if _, err := natscore.ReconcileStreamConsumers(ctx, stream, natscore.WorkerTaskKeepPolicy()); err != nil {
		logs.WarnCtx(ctx, "worker task stream consumer reconcile failed", "error", err)
	}

	consumerConfig := jetstream.ConsumerConfig{
		Durable:       natscore.ConsumerTaskWorker,
		FilterSubject: natscore.WorkerTaskStreamSubjects[0], // "task.>"
		DeliverPolicy: jetstream.DeliverLastPolicy,
		AckPolicy:     jetstream.AckExplicitPolicy,
		AckWait:       30 * time.Second,
		MaxDeliver:    5,
	}

	consumer, err := natscore.GetOrCreateConsumer(ctx, stream, consumerConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to create task consumer: %w", err)
	}

	processor := func(msg jetstream.Msg) {
		processMessage(msg, msg.Subject(), deps.AsynqClient)
	}

	stopChan := make(chan struct{})
	startMessageLoop(consumer, processor, stopChan, natscore.WorkerTaskStreamSubjects[0], ctx)

	logs.DebugCtx(ctx, "subscribed to task stream", "subject", natscore.WorkerTaskStreamSubjects[0], "consumer", natscore.ConsumerTaskWorker, "type", "pull")

	return func(ctx context.Context) {
		close(stopChan)
	}, nil
}
