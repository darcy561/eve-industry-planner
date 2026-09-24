package objectstore

import (
	"context"
	"slices"
	"testing"
	"time"
)

type order struct {
	OrderID    int64   `json:"order_id"`
	LocationID int64   `json:"location_id"`
	Price      float64 `json:"price"`
}

func pageOf(ids ...int64) []order {
	out := make([]order, len(ids))
	for i, id := range ids {
		out[i] = order{OrderID: id, LocationID: 60003760, Price: float64(id) * 1.5}
	}
	return out
}

func newPages(t *testing.T) (*MarketPages, *MemoryBackend) {
	t.Helper()
	backend := NewMemoryBackend()
	return NewMarketPages(backend), backend
}

func TestAPageComesBackAsItWentIn(t *testing.T) {
	t.Parallel()
	pages, _ := newPages(t)
	ctx := context.Background()

	written := pageOf(1, 2, 3)
	if err := pages.Put(ctx, 10000002, 1, written); err != nil {
		t.Fatalf("Put: %v", err)
	}

	var read []order
	if err := pages.Get(ctx, 10000002, 1, &read); err != nil {
		t.Fatalf("Get: %v", err)
	}
	if !slices.Equal(read, written) {
		t.Fatalf("read %v, want %v", read, written)
	}
}

// A caller replaying a 304 has to tell "no page held" from "the store broke",
// because the first downgrades the region to changed and the second must fail.
func TestAMissingPageIsNotFound(t *testing.T) {
	t.Parallel()
	pages, _ := newPages(t)

	var read []order
	if err := pages.Get(context.Background(), 10000002, 7, &read); err != ErrNotFound {
		t.Fatalf("Get of an unheld page returned %v, want ErrNotFound", err)
	}
}

// Two regions share a bucket, so a key that did not carry the region would let
// one region's walk answer for another's.
func TestRegionsDoNotShareAPage(t *testing.T) {
	t.Parallel()
	pages, _ := newPages(t)
	ctx := context.Background()

	if err := pages.Put(ctx, 10000002, 1, pageOf(1)); err != nil {
		t.Fatalf("Put: %v", err)
	}
	if err := pages.Put(ctx, 10000043, 1, pageOf(99)); err != nil {
		t.Fatalf("Put: %v", err)
	}

	var read []order
	if err := pages.Get(ctx, 10000043, 1, &read); err != nil {
		t.Fatalf("Get: %v", err)
	}
	if len(read) != 1 || read[0].OrderID != 99 {
		t.Fatalf("read %v, want the other region's page", read)
	}
}

// Page numbers are read back from keys, and lexical order puts "10" before "2".
func TestPageNumbersComeBackInNumericOrder(t *testing.T) {
	t.Parallel()
	pages, _ := newPages(t)
	ctx := context.Background()

	for _, page := range []int{1, 2, 10, 11, 3} {
		if err := pages.Put(ctx, 10000002, page, pageOf(int64(page))); err != nil {
			t.Fatalf("Put %d: %v", page, err)
		}
	}

	held, err := pages.PageNumbers(ctx, 10000002)
	if err != nil {
		t.Fatalf("PageNumbers: %v", err)
	}
	want := []int{1, 2, 3, 10, 11}
	if !slices.Equal(held, want) {
		t.Fatalf("PageNumbers = %v, want %v", held, want)
	}
}

func TestDroppingARegionLeavesTheOthers(t *testing.T) {
	t.Parallel()
	pages, backend := newPages(t)
	ctx := context.Background()

	for _, page := range []int{1, 2, 3} {
		if err := pages.Put(ctx, 10000002, page, pageOf(int64(page))); err != nil {
			t.Fatalf("Put: %v", err)
		}
	}
	if err := pages.Put(ctx, 10000043, 1, pageOf(9)); err != nil {
		t.Fatalf("Put: %v", err)
	}

	if err := pages.DropRegion(ctx, 10000002); err != nil {
		t.Fatalf("DropRegion: %v", err)
	}
	if backend.Len() != 1 {
		t.Fatalf("held %d objects, want only the other region's page", backend.Len())
	}
}

// A shrunk region leaves trailing pages that a later walk would otherwise replay
// as though they were still part of it.
func TestDroppingFromAPageLeavesTheOnesBelow(t *testing.T) {
	t.Parallel()
	pages, _ := newPages(t)
	ctx := context.Background()

	for _, page := range []int{1, 2, 3, 4, 5} {
		if err := pages.Put(ctx, 10000002, page, pageOf(int64(page))); err != nil {
			t.Fatalf("Put: %v", err)
		}
	}

	if err := pages.DropPagesFrom(ctx, 10000002, 3); err != nil {
		t.Fatalf("DropPagesFrom: %v", err)
	}

	held, err := pages.PageNumbers(ctx, 10000002)
	if err != nil {
		t.Fatalf("PageNumbers: %v", err)
	}
	if want := []int{1, 2}; !slices.Equal(held, want) {
		t.Fatalf("held %v, want %v", held, want)
	}
}

// Object storage has no expiry of its own, so without this the bucket grows
// for ever — the one thing moving off Redis genuinely gave up.
func TestRetentionDropsOnlyRegionsOlderThanTheCutoff(t *testing.T) {
	t.Parallel()
	pages, backend := newPages(t)
	ctx := context.Background()

	old := time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)
	recent := time.Date(2026, 9, 20, 0, 0, 0, 0, time.UTC)

	backend.SetClock(func() time.Time { return old })
	if err := pages.Put(ctx, 10000002, 1, pageOf(1)); err != nil {
		t.Fatalf("Put: %v", err)
	}

	backend.SetClock(func() time.Time { return recent })
	if err := pages.Put(ctx, 10000043, 1, pageOf(2)); err != nil {
		t.Fatalf("Put: %v", err)
	}

	dropped, err := pages.DropRegionsOlderThan(ctx, time.Date(2026, 9, 10, 0, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatalf("DropRegionsOlderThan: %v", err)
	}
	if dropped != 1 {
		t.Fatalf("dropped %d regions, want 1", dropped)
	}

	var read []order
	if err := pages.Get(ctx, 10000043, 1, &read); err != nil {
		t.Fatalf("the recent region went: %v", err)
	}
	if err := pages.Get(ctx, 10000002, 1, &read); err != ErrNotFound {
		t.Fatalf("the old region survived: %v", err)
	}
}

// A region is judged by its newest page, because a walk rewrites the whole region
// and the early pages of a walk in progress are older than the cutoff while the
// region itself is being refreshed right now.
func TestARegionMidWalkIsNotDropped(t *testing.T) {
	t.Parallel()
	pages, backend := newPages(t)
	ctx := context.Background()

	backend.SetClock(func() time.Time { return time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC) })
	if err := pages.Put(ctx, 10000002, 1, pageOf(1)); err != nil {
		t.Fatalf("Put: %v", err)
	}

	backend.SetClock(func() time.Time { return time.Date(2026, 9, 20, 0, 0, 0, 0, time.UTC) })
	if err := pages.Put(ctx, 10000002, 2, pageOf(2)); err != nil {
		t.Fatalf("Put: %v", err)
	}

	dropped, err := pages.DropRegionsOlderThan(ctx, time.Date(2026, 9, 10, 0, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatalf("DropRegionsOlderThan: %v", err)
	}
	if dropped != 0 {
		t.Fatalf("dropped %d regions, want the part-written one kept", dropped)
	}
	if backend.Len() != 2 {
		t.Fatalf("held %d pages, want both", backend.Len())
	}
}

// Configured without object storage, a caller degrades rather than panicking.
func TestAPageStoreWithNoBackendReportsItself(t *testing.T) {
	t.Parallel()

	if NewMarketPages(nil).Available() {
		t.Error("a page store with no backend reported itself available")
	}
	if !NewMarketPages(NewMemoryBackend()).Available() {
		t.Error("a page store with a backend reported itself unavailable")
	}
}
