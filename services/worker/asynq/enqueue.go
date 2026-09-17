package asynq

import (
	"context"
	"errors"
	"eve-industry-planner/shared/jsoncodec"
	"fmt"
	"time"

	"eve-industry-planner/shared/logs"
	eipnats "eve-industry-planner/shared/nats"
	"eve-industry-planner/shared/telemetry/natsprop"

	"github.com/hibiken/asynq"
	"github.com/nats-io/nats.go/jetstream"
)

// Enqueue hands a task message from the stream to the asynq server, where it is
// executed. The queue it runs on and the deadline it runs under come from the
// task's definition, which the subscriber resolved from the subject.
//
// Returns once the task is queued; the caller acknowledges the NATS message
// after that, so durability passes to Redis at this point.
func Enqueue(ctx context.Context, msg jetstream.Msg, client *asynq.Client, task eipnats.Definition) error {
	payload := msg.Data()

	var natsMsg eipnats.Message
	if err := jsoncodec.Unmarshal(payload, &natsMsg); err != nil {
		return fmt.Errorf("failed to unmarshal NATS message: %w", err)
	}

	// The request travels as the publisher wrote it. Asynq carries the task type
	// in its own field, which is what the mux routes on, so nothing wraps it here
	// to say again what the task already knows.
	payloadBytes := natsMsg.Data

	queue := task.DefaultPriority
	taskTimeout := taskTimeoutFor(task)

	// Injected from this span rather than copied from the inbound headers, so the execution span
	// is a child of the bridge rather than a sibling and the wait in Redis is the gap between
	// them. The request identity still travels on the inbound headers.
	traceHeaders := natsprop.AsynqHeadersForBridge(ctx, msg.Headers())

	// Retention keeps a task readable for a day after it runs, so an operator can
	// still see what happened to it. It also bounds the dedup below: an ID stays
	// claimed only while its task is in Redis, so retention must outlast the
	// consumer's redelivery window for a redelivery to be recognised.
	opts := []asynq.Option{
		asynq.Queue(queue),
		asynq.Retention(24 * time.Hour),
		asynq.Timeout(taskTimeout),
		asynq.MaxRetry(taskRetriesFor(task)),
	}
	if id, ok := taskIDFor(msg, task); ok {
		opts = append(opts, asynq.TaskID(id))
	}
	queued := asynq.NewTask(task.Name, payloadBytes, opts...)
	if len(traceHeaders) > 0 {
		queued = asynq.NewTaskWithHeaders(task.Name, payloadBytes, traceHeaders, opts...)
	}

	if _, err := client.Enqueue(queued); err != nil {
		// The stream redelivers a message whose task was already queued — an ack
		// that was slow or lost, or a replica that died between the two. The task
		// is on the queue either way, so the delivery has done its job.
		if errors.Is(err, asynq.ErrTaskIDConflict) {
			logs.DebugCtx(ctx, "task already queued for this delivery",
				"task_type", task.Name)
			return nil
		}
		return fmt.Errorf("failed to enqueue task to asynq server: %w", err)
	}

	return nil
}

// taskIDFor derives a task's identity from the stream sequence of the message
// that carried it. The sequence is assigned once when the message is stored and
// survives redelivery, so the same delivery resolves to the same ID while two
// genuine dispatches of the same work do not collide.
//
// Reports false when the metadata cannot be read, which leaves asynq to generate
// an ID: losing deduplication is better than dropping the task.
func taskIDFor(msg jetstream.Msg, task eipnats.Definition) (string, bool) {
	md, err := msg.Metadata()
	if err != nil || md == nil {
		return "", false
	}
	return fmt.Sprintf("%s:%d", task.Name, md.Sequence.Stream), true
}
