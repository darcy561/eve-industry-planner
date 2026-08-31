package asynq

import (
	eipnats "eve-industry-planner/shared/nats"
	"testing"
	"time"
)

func TestGetTaskTimeout_DefaultPerTaskType(t *testing.T) {
	got := GetTaskTimeout("refreshRegionMarketOrders")
	want := eipnats.RefreshRegionMarketOrders.DefaultTimeout
	if got != want {
		t.Fatalf("GetTaskTimeout(refreshRegionMarketOrders) = %v, want %v", got, want)
	}
}

// A definition's timeout is still clamped, which is what keeps an implausible
// value in tasks.go from becoming an asynq deadline.
func TestGetTaskTimeout_ClampsDefinitionDefault(t *testing.T) {
	if got := clampTaskTimeout(time.Second); got != minTaskTimeout {
		t.Fatalf("clamp(1s) = %v, want min %v", got, minTaskTimeout)
	}
	if got := clampTaskTimeout(72 * time.Hour); got != maxTaskTimeout {
		t.Fatalf("clamp(72h) = %v, want max %v", got, maxTaskTimeout)
	}
}

func TestGetTaskTimeout_UnknownTaskType(t *testing.T) {
	got := GetTaskTimeout("nonexistentTask")
	want := eipnats.DefaultWorkerTaskTimeout
	if got != want {
		t.Fatalf("GetTaskTimeout(unknown) = %v, want default %v", got, want)
	}
}

// The asynq mux keys handlers by a bare string. A drain task whose handler key
// does not match its task name is registered but never routed to — the queue
// would fill with nothing draining it and no error anywhere to say so.
func TestDrainAccountStatsRebuildQueue_TaskNameIsRegistered(t *testing.T) {
	task := eipnats.DrainAccountStatsRebuildQueue

	if task.Name != "drainAccountStatsRebuildQueue" {
		t.Fatalf("task name = %q; the asynq handler key in handlers.go must be updated to match", task.Name)
	}

	got, ok := eipnats.LookupTask(task.Name)
	if !ok {
		t.Fatalf("the registry is missing %q, so the worker falls back to the default timeout", task.Name)
	}
	if got.DefaultTimeout != task.DefaultTimeout {
		t.Fatalf("registry[%q].DefaultTimeout = %v, want %v", task.Name, got.DefaultTimeout, task.DefaultTimeout)
	}
	if GetTaskTimeout(task.Name) != task.DefaultTimeout {
		t.Fatalf("GetTaskTimeout(%q) = %v, want %v", task.Name, GetTaskTimeout(task.Name), task.DefaultTimeout)
	}
}
