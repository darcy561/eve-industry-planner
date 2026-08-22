package asynq

import (
	"testing"
	"time"

	taskscore "eve-industry-planner/shared/tasks"
)

func TestGetTaskTimeout_DefaultPerTaskType(t *testing.T) {
	got := GetTaskTimeout("refreshRegionMarketOrders", 0)
	want := taskscore.RefreshRegionMarketOrders.DefaultTimeout
	if got != want {
		t.Fatalf("GetTaskTimeout(refreshRegionMarketOrders, 0) = %v, want %v", got, want)
	}
}

func TestGetTaskTimeout_UnknownTaskType(t *testing.T) {
	got := GetTaskTimeout("nonexistentTask", 0)
	want := taskscore.DefaultWorkerTaskTimeout
	if got != want {
		t.Fatalf("GetTaskTimeout(unknown, 0) = %v, want default %v", got, want)
	}
}

func TestGetTaskTimeout_OverrideSeconds(t *testing.T) {
	got := GetTaskTimeout("refreshRegionMarketOrders", 120)
	want := 2 * time.Minute
	if got != want {
		t.Fatalf("GetTaskTimeout(..., 120) = %v, want %v", got, want)
	}
}

func TestGetTaskTimeout_ClampMin(t *testing.T) {
	got := GetTaskTimeout("refreshRegionMarketOrders", 1)
	if got != minTaskTimeout {
		t.Fatalf("GetTaskTimeout(..., 1) = %v, want min %v", got, minTaskTimeout)
	}
}

func TestGetTaskTimeout_ClampMax(t *testing.T) {
	got := GetTaskTimeout("refreshRegionMarketOrders", 999999)
	if got != maxTaskTimeout {
		t.Fatalf("GetTaskTimeout(..., huge) = %v, want max %v", got, maxTaskTimeout)
	}
}

// The asynq mux keys handlers by a bare string. A drain task whose handler key
// does not match its task name is registered but never routed to — the queue
// would fill with nothing draining it and no error anywhere to say so.
func TestDrainAccountStatsRebuildQueue_TaskNameIsRegistered(t *testing.T) {
	task := taskscore.DrainAccountStatsRebuildQueue

	if task.Name != "drainAccountStatsRebuildQueue" {
		t.Fatalf("task name = %q; the asynq handler key in handlers.go must be updated to match", task.Name)
	}

	got, ok := taskscore.ByName[task.Name]
	if !ok {
		t.Fatalf("ByName is missing %q, so the worker falls back to the default timeout", task.Name)
	}
	if got.DefaultTimeout != task.DefaultTimeout {
		t.Fatalf("ByName[%q].DefaultTimeout = %v, want %v", task.Name, got.DefaultTimeout, task.DefaultTimeout)
	}
	if GetTaskTimeout(task.Name, 0) != task.DefaultTimeout {
		t.Fatalf("GetTaskTimeout(%q, 0) = %v, want %v", task.Name, GetTaskTimeout(task.Name, 0), task.DefaultTimeout)
	}
}
