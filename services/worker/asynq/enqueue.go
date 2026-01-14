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

// EnqueueESI receives an ESI NATS message and enqueues it to the ESI asynq server.
// This is the ESI enqueue service - completely independent from regular message processing.
// Returns immediately after enqueueing - NATS message should be acknowledged after this.
func EnqueueESI(
	msg jetstream.Msg,
	esiClient *asynq.Client,
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

	// Determine ESI queue based on priority
	queue := GetESIQueue(subject)

	// Create asynq task with retention to prevent expiration
	// Retention of 24 hours ensures messages don't expire while waiting in queue
	task := asynq.NewTask(taskType, payloadBytes,
		asynq.Queue(queue),
		asynq.Retention(24*time.Hour), // Keep tasks for 24 hours to prevent expiration
		asynq.Timeout(60*time.Second), // Task execution timeout
	)

	// Enqueue to ESI asynq server - this is fast and non-blocking
	_, err = esiClient.Enqueue(task)
	if err != nil {
		return fmt.Errorf("failed to enqueue task to ESI asynq server: %w", err)
	}

	return nil
}

// EnqueueRegular receives a regular NATS message and enqueues it to the regular asynq server.
// This is the regular enqueue service - completely independent from ESI message processing.
// Returns immediately after enqueueing - NATS message should be acknowledged after this.
func EnqueueRegular(
	msg jetstream.Msg,
	regularClient *asynq.Client,
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

	// Determine regular queue based on priority
	queue := GetRegularQueue(subject)

	// Create asynq task with retention to prevent expiration
	// Retention of 24 hours ensures messages don't expire while waiting in queue
	task := asynq.NewTask(taskType, payloadBytes,
		asynq.Queue(queue),
		asynq.Retention(24*time.Hour), // Keep tasks for 24 hours to prevent expiration
		asynq.Timeout(60*time.Second), // Task execution timeout
	)

	// Enqueue to regular asynq server - this is fast and non-blocking
	_, err = regularClient.Enqueue(task)
	if err != nil {
		return fmt.Errorf("failed to enqueue task to regular asynq server: %w", err)
	}

	return nil
}
