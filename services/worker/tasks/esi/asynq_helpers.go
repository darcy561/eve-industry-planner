package tasks

import (
	"encoding/json"
	"fmt"

	eipnats "eve-industry-planner/shared/nats"

	"github.com/hibiken/asynq"
)

// UnmarshalTaskPayload extracts and unmarshals the payload from an asynq.Task.
// This function expects the task payload to be wrapped in a taskPayload structure
// with TaskType and Data fields, where Data contains the actual task data.
func UnmarshalTaskPayload[T any](task *asynq.Task) (T, error) {
	var result T

	// Parse the asynq task payload structure
	var payload struct {
		TaskType string          `json:"task_type"`
		Data     json.RawMessage `json:"data"`
	}
	if err := json.Unmarshal(task.Payload(), &payload); err != nil {
		return result, fmt.Errorf("failed to unmarshal task payload: %w", err)
	}

	// Parse the actual task data from TaskMessage.Data
	var taskMsg eipnats.TaskMessage
	if err := json.Unmarshal(payload.Data, &taskMsg); err != nil {
		// If not TaskMessage format, try parsing payload.Data directly
		if err := json.Unmarshal(payload.Data, &result); err != nil {
			return result, fmt.Errorf("failed to unmarshal task data: %w", err)
		}
		return result, nil
	}

	// Parse TaskMessage.Data as the target type
	if err := json.Unmarshal(taskMsg.Data, &result); err != nil {
		return result, fmt.Errorf("failed to unmarshal task message payload: %w", err)
	}

	return result, nil
}
