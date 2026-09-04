package asynq

import (
	"encoding/json"
	"fmt"
	"time"

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
func Enqueue(msg jetstream.Msg, client *asynq.Client, task eipnats.Definition) error {
	payload := msg.Data()

	var natsMsg eipnats.Message
	if err := json.Unmarshal(payload, &natsMsg); err != nil {
		return fmt.Errorf("failed to unmarshal NATS message: %w", err)
	}

	// The request travels as the publisher wrote it. Asynq carries the task type
	// in its own field, which is what the mux routes on, so nothing wraps it here
	// to say again what the task already knows.
	payloadBytes := natsMsg.Data

	queue := task.DefaultPriority
	taskTimeout := taskTimeoutFor(task)

	// The trace and the request identity carry on the headers the message arrived
	// with, so a handler's own publishes and queries stay on the trace that caused
	// the task.
	traceHeaders := natsprop.AsynqHeadersFromNATS(msg.Headers())

	// Retention keeps a task readable for a day after it runs, so an operator can
	// still see what happened to it.
	opts := []asynq.Option{
		asynq.Queue(queue),
		asynq.Retention(24 * time.Hour),
		asynq.Timeout(taskTimeout),
	}
	queued := asynq.NewTask(task.Name, payloadBytes, opts...)
	if len(traceHeaders) > 0 {
		queued = asynq.NewTaskWithHeaders(task.Name, payloadBytes, traceHeaders, opts...)
	}

	if _, err := client.Enqueue(queued); err != nil {
		return fmt.Errorf("failed to enqueue task to asynq server: %w", err)
	}

	return nil
}
