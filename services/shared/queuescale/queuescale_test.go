package queuescale

import (
	eipnats "eve-industry-planner/shared/nats"
	"testing"
)

func TestScaleUpPressure_priorityThresholds(t *testing.T) {
	pct := DefaultQueueScaleUpPendingPct
	slots := 100 // 2 workers × 50

	if ScaleUpPressure(map[string]int{eipnats.Priority1: 10}, slots, pct) {
		t.Fatal("P1 at 10 (== 10%) should not trigger (need >)")
	}
	if !ScaleUpPressure(map[string]int{eipnats.Priority1: 11}, slots, pct) {
		t.Fatal("P1 at 11 should trigger")
	}
	if ScaleUpPressure(map[string]int{eipnats.Priority5: 200}, slots, pct) {
		t.Fatal("P5 at 200 (== 200%) should not trigger")
	}
	if !ScaleUpPressure(map[string]int{eipnats.Priority5: 201}, slots, pct) {
		t.Fatal("P5 at 201 should trigger")
	}
	if ScaleUpPressure(map[string]int{eipnats.Priority5: 150}, slots, pct) {
		t.Fatal("P5 at 150 should not trigger while under 200%")
	}
}

func TestMergeQueueScaleUpPendingPct(t *testing.T) {
	m := MergeQueueScaleUpPendingPct(map[string]float64{eipnats.Priority5: 3.0})
	if m[eipnats.Priority1] != 0.10 {
		t.Fatalf("default P1=%v", m[eipnats.Priority1])
	}
	if m[eipnats.Priority5] != 3.0 {
		t.Fatalf("override P5=%v", m[eipnats.Priority5])
	}
}
