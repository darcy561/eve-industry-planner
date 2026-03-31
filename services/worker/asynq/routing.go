package asynq

import (
	taskscore "eve-industry-planner/shared/tasks"
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
