package asynq

import (
	"time"

	taskscore "eve-industry-planner/shared/tasks"
)

const (
	minTaskTimeout = 10 * time.Second
	maxTaskTimeout = 2 * time.Hour
)

// validQueues is the set of allowed queue names for override validation (tasks.Priority1..5).
var validQueues = map[string]bool{
	taskscore.Priority1: true,
	taskscore.Priority2: true,
	taskscore.Priority3: true,
	taskscore.Priority4: true,
	taskscore.Priority5: true,
}

// DefaultPriorityForTaskType returns the default queue name for a task type from shared/tasks.
func DefaultPriorityForTaskType(taskType string) string {
	if t, ok := taskscore.ByName[taskType]; ok {
		return t.DefaultPriority
	}
	return taskscore.Priority3
}

// GetPriorityQueue returns the queue name for a task: override if valid and set, otherwise the task default from shared/tasks.
func GetPriorityQueue(taskType string, overridePriority string) string {
	if overridePriority != "" && validQueues[overridePriority] {
		return overridePriority
	}
	return DefaultPriorityForTaskType(taskType)
}

// DefaultTimeoutForTaskType returns the asynq execution timeout for a task type from shared/tasks.
func DefaultTimeoutForTaskType(taskType string) time.Duration {
	if t, ok := taskscore.ByName[taskType]; ok && t.DefaultTimeout > 0 {
		return t.DefaultTimeout
	}
	return taskscore.DefaultWorkerTaskTimeout
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

// GetTaskTimeout returns the asynq handler deadline: message override (seconds) if > 0, else per-task default, clamped.
func GetTaskTimeout(taskType string, overrideTimeoutSeconds int) time.Duration {
	if overrideTimeoutSeconds > 0 {
		return clampTaskTimeout(time.Duration(overrideTimeoutSeconds) * time.Second)
	}
	return clampTaskTimeout(DefaultTimeoutForTaskType(taskType))
}
