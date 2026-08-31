package main

import (
	"context"
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
func processMessage(ctx context.Context, msg jetstream.Msg, client *asynq.Client) error {
	subject := msg.Subject()
	taskType := getTaskTypeFromSubject(subject)
	if taskType == "" {
		return eipnats.Terminate("unknown task type for subject %s", subject)
	}
	if err := asynqpkg.Enqueue(msg, client, taskType, subject); err != nil {
		return fmt.Errorf("enqueue %s to asynq: %w", taskType, err)
	}
	logs.DebugCtx(ctx, "nats task enqueued", "subject", subject, "task_type", taskType)
	return nil
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
	consumerConfig := jetstream.ConsumerConfig{
		Durable:       eipnats.ConsumerTaskWorker,
		FilterSubject: tasks.Spec().Subjects[0],
		DeliverPolicy: jetstream.DeliverLastPolicy,
		AckPolicy:     jetstream.AckExplicitPolicy,
		AckWait:       30 * time.Second,
		MaxDeliver:    5,
	}

	if _, err := tasks.Reconcile(ctx, eipnats.ConsumerTaskWorker); err != nil {
		logs.WarnCtx(ctx, "worker task stream consumer reconcile failed", "error", err)
	}

	processor := eipnats.Handle(workerNatsTracerName, "nats.enqueue_task",
		func(ctx context.Context, msg jetstream.Msg) error {
			return processMessage(ctx, msg, deps.AsynqClient)
		})

	stop, err := tasks.Subscribe(ctx, consumerConfig, processor, eipnats.WithConcurrency(MaxConcurrentEnqueues))
	if err != nil {
		return nil, fmt.Errorf("subscribe to task stream: %w", err)
	}
	logs.DebugCtx(ctx, "subscribed to task stream", "consumer", eipnats.ConsumerTaskWorker)

	return func(context.Context) { stop() }, nil
}
