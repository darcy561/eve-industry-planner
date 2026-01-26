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
// Returns immediately after enqueueing - NATS message should be acknowledged after this.
func Enqueue(
	msg jetstream.Msg,
	client *asynq.Client,
	taskType string,
	subject string,
) error {
	// Extract payload from NATS message
	payload := msg.Data()

	// Parse the NATS message structure to extract task data
	var natsMsg natscore.Message
	if err := json.Unmarshal(payload, &natsMsg); err != nil {
		return fmt.Errorf("failed to unmarshal NATS message: %w", err)
	}

	// Create asynq task payload - preserve the original task data
	asynqPayload := taskPayload{
		TaskType: taskType,
		Data:     natsMsg.Data,
	}

	payloadBytes, err := json.Marshal(asynqPayload)
	if err != nil {
		return fmt.Errorf("failed to marshal asynq payload: %w", err)
	}

	// Determine priority queue based on subject
	queue := GetPriorityQueue(subject)

	// Create asynq task with retention to prevent expiration
	// Retention of 24 hours ensures messages don't expire while waiting in queue
	task := asynq.NewTask(taskType, payloadBytes,
		asynq.Queue(queue),
		asynq.Retention(24*time.Hour), // Keep tasks for 24 hours to prevent expiration
		asynq.Timeout(60*time.Second), // Task execution timeout
	)

	// Enqueue to asynq server - this is fast and non-blocking
	_, err = client.Enqueue(task)
	if err != nil {
		return fmt.Errorf("failed to enqueue task to asynq server: %w", err)
	}

	return nil
}
