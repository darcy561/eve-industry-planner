package main

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"eve-industry-planner/shared/logs"
	eipnats "eve-industry-planner/shared/nats"
	asynqpkg "eve-industry-planner/worker/asynq"

	"github.com/hibiken/asynq"
	"github.com/nats-io/nats.go/jetstream"
)

const workerNatsTracerName = "eve-industry-planner/worker/nats"

// MaxConcurrentEnqueues bounds how many task messages are enqueued to asynq at
// once, so a burst does not overwhelm the asynq client.
const MaxConcurrentEnqueues = 20

// processMessage receives a NATS message and enqueues it to the asynq server.
// Acknowledges NATS message immediately after successful enqueue to prevent redelivery.
func processMessage(
	msg jetstream.Msg,
	subject string,
	client *asynq.Client,
) {
	var envelope eipnats.Message
	_ = json.Unmarshal(msg.Data(), &envelope)

	ctx, endSpan := eipnats.BeginConsumerContext(
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
		deliveryCount, _ := eipnats.GetMessageMetadata(msg)
		eipnats.FinishNATSConsumerOperation(ctx, "warn", "nats task rejected", map[string]any{
			"subject": subject,
			"reason":  "unknown task type",
		})
		eipnats.AcknowledgeMessage(ctx, msg, "unknown task type", deliveryCount)
		return
	}

	// Enqueue to asynq server
	// This is fast and non-blocking - asynq server handles processing with priority queues
	err := asynqpkg.Enqueue(msg, client, taskType, subject)
	if err != nil {
		logs.ErrorCtx(ctx, "failed to enqueue task to asynq", "subject", subject, "error", err)
		eipnats.FinishNATSConsumerOperation(ctx, "warn", "nats task enqueue failed", map[string]any{
			"subject":   subject,
			"task_type": taskType,
			"error":     err.Error(),
		})
		// Nack the message so it can be retried
		eipnats.NackMessage(ctx, msg)
		return
	}

	// Acknowledge NATS message immediately after successful enqueue
	// Message is now safely in asynq queue with retention, won't expire
	deliveryCount, _ := eipnats.GetMessageMetadata(msg)
	eipnats.AcknowledgeMessage(ctx, msg, "enqueued to asynq", deliveryCount)
	eipnats.FinishNATSConsumerOperation(ctx, "debug", "nats task enqueued", map[string]any{
		"subject":   subject,
		"task_type": taskType,
	})
}

// getTaskTypeFromSubject derives the asynq task type from the NATS subject.
// Any subject starting with the task prefix (task.) uses the last segment as the task type.
// Example: task.scheduled.refreshSystemIndexes -> refreshSystemIndexes, task.migration.migrateUserDocumentToMongo -> migrateUserDocumentToMongo
func getTaskTypeFromSubject(subject string) string {
	if !strings.HasPrefix(subject, eipnats.TaskSubjectPrefix) {
		return ""
	}
	after := strings.TrimPrefix(subject, eipnats.TaskSubjectPrefix)
	if after == "" {
		return ""
	}
	if idx := strings.LastIndex(after, "."); idx >= 0 {
		return after[idx+1:]
	}
	return after
}

// SubscribeScheduledTasks sets up a single JetStream pull consumer for all tasks (task.>).
// Any message whose subject starts with the task prefix is accepted and queued; task type is derived
// from the subject (last segment), and priority from GetPriorityQueue(subject).
// Returns a cleanup function and an error if subscription fails.
func SubscribeScheduledTasks(deps *WorkerDependencies) (func(context.Context), error) {
	ctx := context.Background()

	tasks := deps.NATS.Tasks
	taskSubjects := tasks.Spec().Subjects[0]
	if _, err := tasks.Ensure(ctx); err != nil {
		return nil, fmt.Errorf("failed to ensure task stream: %w", err)
	}

	if _, err := tasks.Reconcile(ctx); err != nil {
		logs.WarnCtx(ctx, "worker task stream consumer reconcile failed", "error", err)
	}

	consumerConfig := jetstream.ConsumerConfig{
		Durable:       eipnats.ConsumerTaskWorker,
		FilterSubject: taskSubjects,
		DeliverPolicy: jetstream.DeliverLastPolicy,
		AckPolicy:     jetstream.AckExplicitPolicy,
		AckWait:       30 * time.Second,
		MaxDeliver:    5,
	}

	consumer, err := tasks.Consumer(ctx, consumerConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to create task consumer: %w", err)
	}

	processor := func(msg jetstream.Msg) {
		processMessage(msg, msg.Subject(), deps.AsynqClient)
	}

	stop, err := eipnats.Consume(consumer, taskSubjects, processor, eipnats.WithConcurrency(MaxConcurrentEnqueues))
	if err != nil {
		return nil, fmt.Errorf("failed to start task consume loop: %w", err)
	}

	logs.DebugCtx(ctx, "subscribed to task stream", "subject", taskSubjects, "consumer", eipnats.ConsumerTaskWorker, "type", "pull")

	return func(context.Context) { stop() }, nil
}
