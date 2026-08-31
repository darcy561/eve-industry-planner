package asynq

import (
	eipnats "eve-industry-planner/shared/nats"
	"time"
)

const (
	minTaskTimeout = 10 * time.Second
	maxTaskTimeout = 2 * time.Hour
)

// DefaultPriorityForTaskType returns the default queue name for a task type from shared/tasks.
func DefaultPriorityForTaskType(taskType string) string {
	if t, ok := eipnats.LookupTask(taskType); ok {
		return t.DefaultPriority
	}
	return eipnats.Priority3
}

// GetPriorityQueue returns the queue a task runs on, from its definition.
func GetPriorityQueue(taskType string) string {
	return DefaultPriorityForTaskType(taskType)
}

// DefaultTimeoutForTaskType returns the asynq execution timeout for a task type from shared/tasks.
func DefaultTimeoutForTaskType(taskType string) time.Duration {
	if t, ok := eipnats.LookupTask(taskType); ok && t.DefaultTimeout > 0 {
		return t.DefaultTimeout
	}
	return eipnats.DefaultWorkerTaskTimeout
}

// clampTaskTimeout enforces sane bounds for asynq.Timeout.
func clampTaskTimeout(d time.Duration) time.Duration {
	switch {
	case d < minTaskTimeout:
		return minTaskTimeout
	case d > maxTaskTimeout:
		return maxTaskTimeout
	default:
		return d
	}
}

// GetTaskTimeout returns the asynq handler deadline for a task, clamped.
func GetTaskTimeout(taskType string) time.Duration {
	return clampTaskTimeout(DefaultTimeoutForTaskType(taskType))
}
