package main

import (
	"context"
	"fmt"
	"time"

	"eve-industry-planner/shared/logs"
	eipnats "eve-industry-planner/shared/nats"
	asynqpkg "eve-industry-planner/worker/asynq"

	"github.com/hibiken/asynq"
	"github.com/nats-io/nats.go/jetstream"
)

const workerNatsTracerName = "worker/nats"

// MaxConcurrentEnqueues bounds how many task messages are enqueued to asynq at
// once, so a burst does not overwhelm the asynq client.
const MaxConcurrentEnqueues = 20

// processMessage hands a task message to the asynq server, where it runs.
//
// The subject names the task, and naming it is a lookup in the registry rather
// than a parse of the last segment: a subject no definition claims is refused.
// Defaulting it instead would run unknown work on a guessed queue under a guessed
// deadline, which hides the case worth seeing — a task wired incompletely.
//
// The message is acknowledged once the task is queued, so durability passes to
// Redis at that point.
func processMessage(ctx context.Context, msg jetstream.Msg, client *asynq.Client) error {
	subject := msg.Subject()
	task, ok := eipnats.TaskBySubject(subject)
	if !ok {
		return eipnats.Terminate("no task is registered for subject %s", subject)
	}
	if err := asynqpkg.Enqueue(msg, client, task); err != nil {
		return fmt.Errorf("enqueue %s to asynq: %w", task.Name, err)
	}
	logs.DebugCtx(ctx, "nats task enqueued", "subject", subject, "task_type", task.Name)
	return nil
}

// SubscribeScheduledTasks sets up a single JetStream pull consumer for all tasks
// (task.>). A message is queued if its subject names a registered task, on that
// task's own queue and deadline. Returns a cleanup function.
func SubscribeScheduledTasks(nats *eipnats.NATS, client *asynq.Client) (func(context.Context), error) {
	ctx := context.Background()

	tasks := nats.Tasks
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
			return processMessage(ctx, msg, client)
		})

	stop, err := tasks.Subscribe(ctx, consumerConfig, processor, eipnats.WithConcurrency(MaxConcurrentEnqueues))
	if err != nil {
		return nil, fmt.Errorf("subscribe to task stream: %w", err)
	}
	logs.DebugCtx(ctx, "subscribed to task stream", "consumer", eipnats.ConsumerTaskWorker)

	return func(context.Context) { stop() }, nil
}
