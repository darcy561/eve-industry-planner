package asynq

import (
	"encoding/json"
	"fmt"
	"time"

	natscore "eve-industry-planner/shared/core/nats"

	"github.com/hibiken/asynq"
	"github.com/nats-io/nats.go/jetstream"
)

// taskPayload wraps the NATS message data for asynq processing
type taskPayload struct {
	TaskType string          `json:"task_type"`
	Data     json.RawMessage `json:"data"`
}

// Enqueue receives a NATS message and enqueues it to the asynq server.
// Task type is derived from the subject (by the subscriber). Queue priority is taken from the message
// only if a valid priority field is present; otherwise from shared/tasks.ByName for that task type.
// Execution timeout: TaskMessage.timeout_seconds when > 0 (integer count of seconds in JSON, not minutes or ms),
// else each task type's DefaultTimeout in shared/tasks.
// Returns immediately after enqueueing - NATS message should be acknowledged after this.
func Enqueue(
	msg jetstream.Msg,
	client *asynq.Client,
	taskType string,
	subject string,
) error {
	payload := msg.Data()

	var natsMsg natscore.Message
	if err := json.Unmarshal(payload, &natsMsg); err != nil {
		return fmt.Errorf("failed to unmarshal NATS message: %w", err)
	}

	// Parse TaskMessage to get optional priority and timeout overrides
	var taskMsg natscore.TaskMessage
	overridePriority := ""
	overrideTimeoutSec := 0
	if err := json.Unmarshal(natsMsg.Data, &taskMsg); err == nil {
		if taskMsg.Priority != "" {
			overridePriority = taskMsg.Priority
		}
		if taskMsg.TimeoutSeconds > 0 {
			overrideTimeoutSec = taskMsg.TimeoutSeconds
		}
	}

	asynqPayload := taskPayload{
		TaskType: taskType,
		Data:     natsMsg.Data,
	}

	payloadBytes, err := json.Marshal(asynqPayload)
	if err != nil {
		return fmt.Errorf("failed to marshal asynq payload: %w", err)
	}

	// Queue from message override (if valid) or task type default
	queue := GetPriorityQueue(taskType, overridePriority)
	taskTimeout := GetTaskTimeout(taskType, overrideTimeoutSec)

	// Create asynq task with retention to prevent expiration
	// Retention of 24 hours ensures messages don't expire while waiting in queue
	task := asynq.NewTask(taskType, payloadBytes,
		asynq.Queue(queue),
		asynq.Retention(24*time.Hour), // Keep tasks for 24 hours to prevent expiration
		asynq.Timeout(taskTimeout),
	)

	// Enqueue to asynq server - this is fast and non-blocking
	_, err = client.Enqueue(task)
	if err != nil {
		return fmt.Errorf("failed to enqueue task to asynq server: %w", err)
	}

	return nil
}
