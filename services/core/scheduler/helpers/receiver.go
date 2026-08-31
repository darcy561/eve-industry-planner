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

// SetupScheduleRunner consumes schedules as they fire. A fired schedule arrives
// on `scheduled.{id}`, where the id names the cron job to run, so the runner
// resolves work through the same registry the crons themselves use.
func SetupScheduleRunner(
	natsHandle *eipnats.NATS,
	processMessage func(msg jetstream.Msg),
	stopChan chan struct{},
) (jetstream.Consumer, error) {
	ctx := context.Background()
	schedules := natsHandle.Schedules

	if _, err := schedules.Ensure(ctx); err != nil {
		return nil, fmt.Errorf("failed to ensure schedule stream: %w", err)
	}
	if _, err := schedules.Reconcile(ctx); err != nil {
		logs.WarnCtx(ctx, "schedule stream consumer reconcile failed", "component", schedulerLogComponent, "error", err)
	}

	filter := eipnats.SubjectScheduledPrefix + ".>"
	consumer, err := schedules.Consumer(ctx, jetstream.ConsumerConfig{
		Durable:       eipnats.ConsumerScheduleRunner,
		FilterSubject: filter,
		DeliverPolicy: jetstream.DeliverAllPolicy,
		AckPolicy:     jetstream.AckExplicitPolicy,
		AckWait:       30 * time.Second,
		MaxDeliver:    5,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create schedule runner consumer: %w", err)
	}

	logs.DebugCtx(ctx, "schedule runner consumer setup", "component", schedulerLogComponent,
		"subject", filter, "consumer", eipnats.ConsumerScheduleRunner, "stream", schedules.Spec().Name)

	if err := eipnats.ConsumeUntil(consumer, filter, processMessage, stopChan); err != nil {
		return nil, err
	}
	return consumer, nil
}
