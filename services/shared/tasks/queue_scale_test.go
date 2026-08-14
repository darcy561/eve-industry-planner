package tasks_test

import (
	"testing"

	"eve-industry-planner/shared/tasks"
)

func TestScaleUpPressure_priorityThresholds(t *testing.T) {
	pct := tasks.DefaultQueueScaleUpPendingPct
	slots := 100 // 2 workers × 50

	if tasks.ScaleUpPressure(map[string]int{tasks.Priority1: 10}, slots, pct) {
		t.Fatal("P1 at 10 (== 10%) should not trigger (need >)")
	}
	if !tasks.ScaleUpPressure(map[string]int{tasks.Priority1: 11}, slots, pct) {
		t.Fatal("P1 at 11 should trigger")
	}
	if tasks.ScaleUpPressure(map[string]int{tasks.Priority5: 200}, slots, pct) {
		t.Fatal("P5 at 200 (== 200%) should not trigger")
	}
	if !tasks.ScaleUpPressure(map[string]int{tasks.Priority5: 201}, slots, pct) {
		t.Fatal("P5 at 201 should trigger")
	}
	if tasks.ScaleUpPressure(map[string]int{tasks.Priority5: 150}, slots, pct) {
		t.Fatal("P5 at 150 should not trigger while under 200%")
	}
}

func TestMergeQueueScaleUpPendingPct(t *testing.T) {
	m := tasks.MergeQueueScaleUpPendingPct(map[string]float64{tasks.Priority5: 3.0})
	if m[tasks.Priority1] != 0.10 {
		t.Fatalf("default P1=%v", m[tasks.Priority1])
	}
	if m[tasks.Priority5] != 3.0 {
		t.Fatalf("override P5=%v", m[tasks.Priority5])
	}
}
