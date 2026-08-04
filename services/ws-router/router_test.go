package main

import "testing"

func TestEligibleSlotsDropsCordoned(t *testing.T) {
	t.Parallel()
	ready := []string{"websocket-1", "websocket-2", "websocket-3"}
	got := eligibleSlots(ready, map[string]bool{"websocket-2": true})
	if len(got) != 2 || got[0] != "websocket-1" || got[1] != "websocket-3" {
		t.Fatalf("got %#v", got)
	}
}

func TestEligibleSlotsDropsFull(t *testing.T) {
	t.Parallel()
	ready := []string{"websocket-1", "websocket-2"}
	got := eligibleSlots(ready, mergeSkip(nil, map[string]bool{"websocket-1": true}))
	if len(got) != 1 || got[0] != "websocket-2" {
		t.Fatalf("got %#v", got)
	}
}

func TestEligibleSlotsAllSkippedFallsBack(t *testing.T) {
	t.Parallel()
	ready := []string{"websocket-1", "websocket-2"}
	got := eligibleSlots(ready, map[string]bool{"websocket-1": true, "websocket-2": true})
	if len(got) != 2 {
		t.Fatalf("expected fallback to all ready, got %#v", got)
	}
}

func TestEligibleSlotsAllCordonedFallsBack(t *testing.T) {
	t.Parallel()
	ready := []string{"websocket-1", "websocket-2"}
	got := eligibleSlots(ready, map[string]bool{"websocket-1": true, "websocket-2": true})
	if len(got) != 2 {
		t.Fatalf("expected fallback to all ready, got %#v", got)
	}
}

func TestMergeSkipUnionsCordonAndFull(t *testing.T) {
	t.Parallel()
	got := mergeSkip(
		map[string]bool{"websocket-1": true},
		map[string]bool{"websocket-2": true},
	)
	if !got["websocket-1"] || !got["websocket-2"] {
		t.Fatalf("got %#v", got)
	}
}

func TestPreferNewestSlots(t *testing.T) {
	t.Parallel()
	vers := map[string]string{
		"websocket-1": "0.8.25",
		"websocket-2": "0.8.26",
		"websocket-3": "0.8.26",
	}
	got := preferNewestSlots([]string{"websocket-1", "websocket-2", "websocket-3"}, func(s string) string {
		return vers[s]
	})
	if len(got) != 2 || got[0] != "websocket-2" || got[1] != "websocket-3" {
		t.Fatalf("got %#v", got)
	}
}

func TestPreferNewestSlotsMissingVersions(t *testing.T) {
	t.Parallel()
	ready := []string{"websocket-1", "websocket-2"}
	got := preferNewestSlots(ready, func(string) string { return "" })
	if len(got) != 2 {
		t.Fatalf("expected fallback, got %#v", got)
	}
}

func TestCompareSemverXYZ(t *testing.T) {
	t.Parallel()
	if compareSemverXYZ("0.8.26", "0.8.25") <= 0 {
		t.Fatal("26 should be > 25")
	}
	if compareSemverXYZ("0.8.25", "0.8.25") != 0 {
		t.Fatal("equal")
	}
	if compareSemverXYZ("0.8.24", "0.8.25") >= 0 {
		t.Fatal("24 should be < 25")
	}
}

func TestPickSlotPrefersLowerLoad(t *testing.T) {
	t.Parallel()
	r := &Router{load: map[string]int64{"websocket-1": 5, "websocket-2": 1}}
	got := r.pickSlot([]string{"websocket-1", "websocket-2"})
	if got != "websocket-2" {
		t.Fatalf("got %s want websocket-2", got)
	}
}

func TestPreferNonSoftSlots(t *testing.T) {
	t.Parallel()
	preferred := []string{"websocket-1", "websocket-2", "websocket-3"}
	got := preferNonSoftSlots(preferred, map[string]bool{"websocket-1": true, "websocket-3": true})
	if len(got) != 1 || got[0] != "websocket-2" {
		t.Fatalf("got %#v", got)
	}
}

func TestPreferNonSoftSlotsAllSoftFallsBack(t *testing.T) {
	t.Parallel()
	preferred := []string{"websocket-1", "websocket-2"}
	got := preferNonSoftSlots(preferred, map[string]bool{"websocket-1": true, "websocket-2": true})
	if len(got) != 2 || got[0] != "websocket-1" || got[1] != "websocket-2" {
		t.Fatalf("expected all-soft fallback, got %#v", got)
	}
}

func TestPreferNonSoftSlotsEmptySoftUnchanged(t *testing.T) {
	t.Parallel()
	preferred := []string{"websocket-1", "websocket-2"}
	got := preferNonSoftSlots(preferred, nil)
	if len(got) != 2 {
		t.Fatalf("got %#v", got)
	}
}

func TestEligibleSlotsIgnoresSoft(t *testing.T) {
	t.Parallel()
	// Soft must not enter mergeSkip — soft slot stays eligible.
	ready := []string{"websocket-1", "websocket-2"}
	got := eligibleSlots(ready, mergeSkip(nil, nil))
	if len(got) != 2 {
		t.Fatalf("got %#v", got)
	}
	softPreferred := preferNonSoftSlots(got, map[string]bool{"websocket-1": true})
	if len(softPreferred) != 1 || softPreferred[0] != "websocket-2" {
		t.Fatalf("pick filter %#v", softPreferred)
	}
}

func TestFormatTruncate(t *testing.T) {
	t.Parallel()
	if truncate("abcdef", 3) != "abc" {
		t.Fatal("truncate")
	}
}

func TestSlotIDFromTaskIgnoresSwarmTemplate(t *testing.T) {
	t.Parallel()
	env := []string{"OTEL_SERVICE_INSTANCE_ID=websocket-{{.Task.Slot}}", "FOO=bar"}
	if got := slotIDFromTask(2, env); got != "websocket-2" {
		t.Fatalf("got %s want websocket-2", got)
	}
	if got := slotIDFromTask(1, []string{"OTEL_SERVICE_INSTANCE_ID=websocket-1"}); got != "websocket-1" {
		t.Fatalf("got %s want websocket-1", got)
	}
}
