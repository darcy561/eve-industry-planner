package soaklib

import (
	"context"
	"strconv"
	"sync/atomic"
	"testing"
	"time"
)

func TestChurnPoolFreezeStopsScheduling(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	ids := make([]clientIdentity, 10)
	for i := range ids {
		ids[i] = clientIdentity{AccountID: "f" + strconv.Itoa(i+1), SessionID: "s" + strconv.Itoa(i+1)}
	}
	stats, errCh, freeze, pool := startChurnPool(ctx, ChurnPoolOptions{
		Initial:      ids,
		LiveRatio:    0.5,
		TickEvery:    5 * time.Millisecond,
		ReplaceEvery: 5 * time.Millisecond,
		LeaveTimeout: time.Second,
		Seed:         2,
		RunIdentity: func(wctx context.Context, _ clientIdentity) {
			<-wctx.Done()
		},
	})
	if err := waitChurnLive(ctx, stats, 5, 5*time.Millisecond); err != nil {
		t.Fatal(err)
	}
	// A swap committed before freeze still drains through the join/leave
	// channels, so baseline the counters once that work has been applied.
	freeze()
	if err := waitChurnQuiesced(ctx, pool, 5*time.Millisecond); err != nil {
		t.Fatal(err)
	}
	joinsBefore := stats.Joins.Load()
	leavesBefore := stats.Leaves.Load()
	for range 20 {
		time.Sleep(5 * time.Millisecond)
		if stats.Joins.Load() != joinsBefore || stats.Leaves.Load() != leavesBefore {
			t.Fatalf("freeze should stop churn joins/leaves; joins %d→%d leaves %d→%d",
				joinsBefore, stats.Joins.Load(), leavesBefore, stats.Leaves.Load())
		}
	}
	cancel()
	for range errCh {
	}
}

func TestChurnPoolLiveRatioNoPublisher(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	ids := make([]clientIdentity, 20)
	for i := range ids {
		ids[i] = clientIdentity{AccountID: "a" + strconv.Itoa(i+1), SessionID: "s" + strconv.Itoa(i+1)}
	}

	var running atomic.Int64
	stats, errCh, _ := StartChurnPool(ctx, ChurnPoolOptions{
		Initial:      ids,
		LiveRatio:    0.5,
		TickEvery:    5 * time.Millisecond,
		LeaveTimeout: time.Second,
		Seed:         1,
		RunIdentity: func(wctx context.Context, id clientIdentity) {
			running.Add(1)
			<-wctx.Done()
			running.Add(-1)
		},
	})

	want := int64(10)
	if err := waitChurnLive(ctx, stats, want, 5*time.Millisecond); err != nil {
		t.Fatal(err)
	}
	time.Sleep(50 * time.Millisecond)
	live := stats.Live.Load()
	if live < want-1 || live > want+1 {
		t.Fatalf("live=%d want~%d (%s)", live, want, stats.summary())
	}
	if stats.Joins.Load() < uint64(want) {
		t.Fatalf("joins=%d", stats.Joins.Load())
	}

	cancel()
	<-errCh
	deadline := time.Now().Add(2 * time.Second)
	for running.Load() != 0 && time.Now().Before(deadline) {
		time.Sleep(5 * time.Millisecond)
	}
	if running.Load() != 0 {
		t.Fatalf("workers still running=%d", running.Load())
	}
}

func TestChurnPoolLeaveWaitsPendingThenClears(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	ids := []clientIdentity{
		{AccountID: "p1", SessionID: "sp1"},
		{AccountID: "p2", SessionID: "sp2"},
		{AccountID: "p3", SessionID: "sp3"},
		{AccountID: "p4", SessionID: "sp4"},
	}
	var ratio atomic.Uint64
	ratio.Store(100)
	var pending atomic.Bool
	pending.Store(true)

	stats, errCh, _ := StartChurnPool(ctx, ChurnPoolOptions{
		Initial:      ids,
		LiveRatio:    1.0,
		TickEvery:    5 * time.Millisecond,
		LeavePoll:    5 * time.Millisecond,
		LeaveTimeout: 2 * time.Second,
		Seed:         9,
		Pending:      func(string) bool { return pending.Load() },
		LiveRatioFunc: func() float64 {
			return float64(ratio.Load()) / 100
		},
		RunIdentity: func(wctx context.Context, _ clientIdentity) {
			<-wctx.Done()
		},
	})

	if err := waitChurnLive(ctx, stats, 4, 5*time.Millisecond); err != nil {
		t.Fatal(err)
	}

	ratio.Store(25) // want 1 → schedule leaves; pending blocks
	time.Sleep(120 * time.Millisecond)
	if stats.Leaves.Load() != 0 {
		t.Fatalf("left too early while pending; leaves=%d", stats.Leaves.Load())
	}

	pending.Store(false)
	deadline := time.Now().Add(2 * time.Second)
	for stats.Live.Load() > 1 && time.Now().Before(deadline) {
		time.Sleep(5 * time.Millisecond)
	}
	if stats.Live.Load() > 1 {
		t.Fatalf("live=%d after pending clear (%s)", stats.Live.Load(), stats.summary())
	}
	if stats.Leaves.Load() == 0 {
		t.Fatal("expected leaves after pending cleared")
	}
	if stats.LeaveTimeouts.Load() != 0 {
		t.Fatalf("unexpected leave_timeout=%d", stats.LeaveTimeouts.Load())
	}

	cancel()
	<-errCh
}

func TestChurnPoolLeaveTimeout(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	ids := []clientIdentity{
		{AccountID: "t1", SessionID: "st1"},
		{AccountID: "t2", SessionID: "st2"},
	}
	var ratio atomic.Uint64
	ratio.Store(100)
	var sawTimeout atomic.Bool

	stats, errCh, _ := StartChurnPool(ctx, ChurnPoolOptions{
		Initial:      ids,
		LiveRatio:    1.0,
		TickEvery:    5 * time.Millisecond,
		LeavePoll:    5 * time.Millisecond,
		LeaveTimeout: 40 * time.Millisecond,
		Seed:         4,
		Pending:      func(string) bool { return true },
		LiveRatioFunc: func() float64 {
			return float64(ratio.Load()) / 100
		},
		OnLeaveTimeout: func(string) { sawTimeout.Store(true) },
		RunIdentity: func(wctx context.Context, _ clientIdentity) {
			<-wctx.Done()
		},
	})
	if err := waitChurnLive(ctx, stats, 2, 5*time.Millisecond); err != nil {
		t.Fatal(err)
	}
	ratio.Store(50)

	deadline := time.Now().Add(2 * time.Second)
	for stats.LeaveTimeouts.Load() == 0 && time.Now().Before(deadline) {
		time.Sleep(5 * time.Millisecond)
	}
	if stats.LeaveTimeouts.Load() == 0 || !sawTimeout.Load() {
		t.Fatalf("expected leave_timeout (%s)", stats.summary())
	}
	// Leave timeout must not abort the pool (large soaks keep running).
	select {
	case err, ok := <-errCh:
		if ok && err != nil {
			t.Fatalf("leave_timeout should be non-fatal, got %v", err)
		}
	case <-time.After(50 * time.Millisecond):
	}
	cancel()
	for range errCh {
	}
}

func TestChurnPoolConsumesGenCh(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	genCh, _, genErr := StartTenantGen(ctx, TenantGenOptions{
		Clients:   24,
		Seed:      11,
		EmitEvery: time.Microsecond,
		NoSeed:    true,
		BufSize:   4,
	})

	stats, errCh, _ := StartChurnPool(ctx, ChurnPoolOptions{
		GenCh:        genCh,
		LiveRatio:    0.65,
		TickEvery:    5 * time.Millisecond,
		LeaveTimeout: time.Second,
		Seed:         11,
		RunIdentity: func(wctx context.Context, _ clientIdentity) {
			<-wctx.Done()
		},
	})

	deadline := time.Now().Add(3 * time.Second)
	for stats.Inventory.Load() < 24 && time.Now().Before(deadline) {
		time.Sleep(5 * time.Millisecond)
	}
	if stats.Inventory.Load() < 24 {
		t.Fatalf("inventory=%d", stats.Inventory.Load())
	}
	want := int64(float64(stats.Inventory.Load())*0.65 + 0.5)
	if err := waitChurnLive(ctx, stats, want, 5*time.Millisecond); err != nil {
		t.Fatal(err)
	}

	cancel()
	<-errCh
	if err := <-genErr; err != nil && ctx.Err() == nil {
		t.Fatal(err)
	}
}

func TestLiveRegistryReadyGenIgnoresStaleSettle(t *testing.T) {
	reg := newLiveRegistry(80 * time.Millisecond)
	id := clientIdentity{AccountID: "r1"}
	reg.MarkLive(id)
	reg.ScheduleReady("r1")
	time.Sleep(20 * time.Millisecond)
	reg.Unregister("r1")
	reg.MarkLive(id)
	reg.ScheduleReady("r1")
	time.Sleep(70 * time.Millisecond)
	if reg.IsReady("r1") {
		t.Fatal("stale settle marked ready too early")
	}
	time.Sleep(40 * time.Millisecond)
	if !reg.IsReady("r1") {
		t.Fatal("expected ready after second settle")
	}
}
