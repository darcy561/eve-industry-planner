package asynq

import (
	"testing"
	"time"

	taskscore "eve-industry-planner/shared/tasks"
)

func TestGetTaskTimeout_DefaultPerTaskType(t *testing.T) {
	got := GetTaskTimeout("refreshMarketPrices", 0)
	want := 30 * time.Minute
	if got != want {
		t.Fatalf("GetTaskTimeout(refreshMarketPrices, 0) = %v, want %v", got, want)
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
	got := GetTaskTimeout("refreshMarketPrices", 120)
	want := 2 * time.Minute
	if got != want {
		t.Fatalf("GetTaskTimeout(..., 120) = %v, want %v", got, want)
	}
}

func TestGetTaskTimeout_ClampMin(t *testing.T) {
	got := GetTaskTimeout("refreshMarketPrices", 1)
	if got != minTaskTimeout {
		t.Fatalf("GetTaskTimeout(..., 1) = %v, want min %v", got, minTaskTimeout)
	}
}

func TestGetTaskTimeout_ClampMax(t *testing.T) {
	got := GetTaskTimeout("refreshMarketPrices", 999999)
	if got != maxTaskTimeout {
		t.Fatalf("GetTaskTimeout(..., huge) = %v, want max %v", got, maxTaskTimeout)
	}
}
