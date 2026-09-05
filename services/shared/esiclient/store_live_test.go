package esiclient_test

import (
	"testing"
	"time"

	"eve-industry-planner/shared/esiclient"
	"eve-industry-planner/testing/redislive"
)

// The scripts decide a rate-limit budget, so at least once they have to run on
// the real Lua interpreter rather than miniredis's reimplementation. What is
// checked here is what a fake is most likely to differ on: the clock the script
// reads, sorted-set expiry ordering, and whether concurrent callers can both
// pass a check that only one should.

func liveStore(t *testing.T) *esiclient.Store {
	t.Helper()
	client := redislive.Require(t)
	redislive.Clean(t, client, "esi:")
	t.Cleanup(func() { redislive.Clean(t, client, "esi:") })
	return esiclient.NewStore(client, esiclient.DefaultConfig())
}

func TestLiveScriptsAgreeWithTheFake(t *testing.T) {
	store := liveStore(t)
	bucket := esiclient.Bucket{Group: "live-market", User: esiclient.AnonymousUser}

	probe, err := store.Reserve(t.Context(), bucket, esiclient.ClassBackground, marketPolicy, 1)
	if err != nil {
		t.Fatalf("Reserve: %v", err)
	}
	if !probe.Granted || !probe.Reservations[0].Probe {
		t.Fatalf("first call should be a discovery probe: %+v", probe)
	}

	second, err := store.Reserve(t.Context(), bucket, esiclient.ClassBackground, marketPolicy, 1)
	if err != nil {
		t.Fatalf("Reserve: %v", err)
	}
	if second.Granted {
		t.Error("only one caller may probe an unknown bucket")
	}

	err = store.Settle(t.Context(), probe.Reservations[0], esiclient.Outcome{
		Status: 200, Cost: 2, ObservedAt: time.Now(),
		Limit: 100, Window: time.Minute, Remaining: 98, Metered: true,
	})
	if err != nil {
		t.Fatalf("Settle: %v", err)
	}

	state, err := store.State(t.Context(), bucket)
	if err != nil {
		t.Fatalf("State: %v", err)
	}
	switch {
	case state.Limit != 100:
		t.Errorf("Limit = %d", state.Limit)
	case state.Window != time.Minute:
		t.Errorf("Window = %v", state.Window)
	case state.Spent != 2:
		t.Errorf("Spent = %d", state.Spent)
	case !state.Metered:
		t.Error("Metered should be true")
	}
}

func TestLiveSubSecondTimesSurviveTheRoundTrip(t *testing.T) {
	store := liveStore(t)
	bucket := esiclient.Bucket{Group: "live-clock", User: esiclient.AnonymousUser}

	probe, _ := store.Reserve(t.Context(), bucket, esiclient.ClassBackground, marketPolicy, 1)
	_ = store.Settle(t.Context(), probe.Reservations[0], esiclient.Outcome{
		Status: 429, ObservedAt: time.Now(), Limit: 100, Window: time.Minute,
		Remaining: 0, RetryAfter: 1500 * time.Millisecond, Metered: true,
	})

	state, err := store.State(t.Context(), bucket)
	if err != nil {
		t.Fatalf("State: %v", err)
	}
	// Redis truncates a Lua number to an integer on the way out, which is why
	// the scripts return strings. If that ever regressed, a fractional gate
	// would land on a whole second.
	if state.GatedUntil.Nanosecond() == 0 {
		t.Errorf("GatedUntil = %v has no sub-second part; the script's float came back truncated", state.GatedUntil)
	}
}

func TestLiveLedgerExpiresChargesIndividually(t *testing.T) {
	store := liveStore(t)
	bucket := esiclient.Bucket{Group: "live-window", User: esiclient.AnonymousUser}

	probe, _ := store.Reserve(t.Context(), bucket, esiclient.ClassBackground, marketPolicy, 1)
	_ = store.Settle(t.Context(), probe.Reservations[0], esiclient.Outcome{
		Status: 200, Cost: 2, ObservedAt: time.Now(),
		Limit: 100, Window: 2 * time.Second, Remaining: 98, Metered: true,
	})

	before, _ := store.State(t.Context(), bucket)
	if before.Spent == 0 {
		t.Fatal("the charge was not recorded")
	}

	// The window floats: a charge expires on its own timestamp rather than the
	// whole window resetting.
	time.Sleep(2500 * time.Millisecond)

	after, err := store.State(t.Context(), bucket)
	if err != nil {
		t.Fatalf("State: %v", err)
	}
	if after.Spent != 0 {
		t.Errorf("Spent = %d after the window passed, want 0", after.Spent)
	}
}

func TestLiveConcurrentReservationsCannotBothWin(t *testing.T) {
	store := liveStore(t)
	bucket := esiclient.Bucket{Group: "live-race", User: esiclient.AnonymousUser}

	probe, _ := store.Reserve(t.Context(), bucket, esiclient.ClassBackground, marketPolicy, 1)
	_ = store.Settle(t.Context(), probe.Reservations[0], esiclient.Outcome{
		Status: 200, Cost: 2, ObservedAt: time.Now(),
		Limit: 10, Window: time.Minute, Remaining: 8, Metered: true,
	})

	// Eight tokens left at two a call is four calls. Twenty callers race for
	// them on a real interpreter, where the script's atomicity is what stops
	// them all passing the same check.
	granted := make(chan int, 20)
	for range 20 {
		go func() {
			grant, err := store.Reserve(t.Context(), bucket, esiclient.ClassBackground, marketPolicy, 1)
			if err == nil && grant.Granted {
				granted <- len(grant.Reservations)
				return
			}
			granted <- 0
		}()
	}

	total := 0
	for range 20 {
		total += <-granted
	}
	if total > 4 {
		t.Errorf("%d slots granted against eight remaining tokens at two a call", total)
	}
	if total == 0 {
		t.Error("nothing was granted at all")
	}
}
