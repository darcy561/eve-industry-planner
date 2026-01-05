package scheduler

import (
	"context"
	"encoding/json"
)

// TaskHandler defines a function that triggers a task
// data is the optional JSON-encoded data passed in the schedule request
type TaskHandler func(ctx context.Context, data json.RawMessage) error

// Scheduler interface for dynamic task scheduling
type Scheduler interface {
	RegisterHandler(taskType string, handler TaskHandler)
	HasScheduledJob(taskType string) bool
}
