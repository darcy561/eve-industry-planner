package redis

import (
	"context"
	"testing"

	"eve-industry-planner/testing/redisfake"
)

func TestNextRegionCronIndex_CyclesInOrder(t *testing.T) {
	ctx := context.Background()
	client := redisfake.New(t).Client

	const count = 4
	want := []int{0, 1, 2, 3, 0, 1}

	for i, expected := range want {
		got, err := NextRegionCronIndex(ctx, client, count)
		if err != nil {
			t.Fatalf("run %d: unexpected error: %v", i, err)
		}
		if got != expected {
			t.Fatalf("run %d: index = %d, want %d", i, got, expected)
		}
	}
}

func TestNextRegionCronIndex_ZeroCount(t *testing.T) {
	got, err := NextRegionCronIndex(context.Background(), redisfake.New(t).Client, 0)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != 0 {
		t.Fatalf("index = %d, want 0", got)
	}
}

func TestSaveAndGetRegionMarketOrdersETags(t *testing.T) {
	ctx := context.Background()
	client := redisfake.New(t).Client
	const regionID = 10000002

	if err := SaveRegionMarketOrdersETags(ctx, client, regionID, map[int]string{1: "a", 2: "b", 3: ""}); err != nil {
		t.Fatalf("save: %v", err)
	}

	got, err := GetRegionMarketOrdersETags(ctx, client, regionID)
	if err != nil {
		t.Fatalf("get: %v", err)
	}

	// Empty ETags are not stored, so page 3 should be absent.
	if len(got) != 2 || got[1] != "a" || got[2] != "b" {
		t.Fatalf("etags = %v, want pages 1 and 2 only", got)
	}
}

func TestDeleteRegionMarketOrdersETagsFrom(t *testing.T) {
	ctx := context.Background()
	client := redisfake.New(t).Client
	const regionID = 10000002

	if err := SaveRegionMarketOrdersETags(ctx, client, regionID, map[int]string{1: "a", 2: "b", 3: "c", 4: "d"}); err != nil {
		t.Fatalf("save: %v", err)
	}

	// A shrunk book leaves pages 3+ stale.
	if err := DeleteRegionMarketOrdersETagsFrom(ctx, client, regionID, 3); err != nil {
		t.Fatalf("delete: %v", err)
	}

	got, err := GetRegionMarketOrdersETags(ctx, client, regionID)
	if err != nil {
		t.Fatalf("get: %v", err)
	}

	if len(got) != 2 || got[1] != "a" || got[2] != "b" {
		t.Fatalf("etags after prune = %v, want pages 1 and 2 only", got)
	}
}
