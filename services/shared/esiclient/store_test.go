package esiclient_test

import (
	"slices"
	"testing"
	"time"

	"eve-industry-planner/shared/esiclient"
	"eve-industry-planner/testing/redisfake"
)

func newStore(t *testing.T) (*esiclient.Store, *redisfake.Redis) {
	t.Helper()
	fake := redisfake.New(t)
	return esiclient.NewStore(fake.Client, esiclient.DefaultConfig()), fake
}

var marketPolicy = esiclient.EndpointPolicy{
	Pattern:           "/markets/{region_id}/orders/",
	CompatibilityDate: "2025-12-16",
	MinSpacing:        10 * time.Millisecond,
}

// known puts a bucket past discovery with a stated allowance.
func known(t *testing.T, store *esiclient.Store, b esiclient.Bucket, limit int, window time.Duration) {
	t.Helper()
	grant, err := store.Reserve(t.Context(), b, esiclient.ClassBackground, marketPolicy, 1)
	if err != nil {
		t.Fatalf("probe reserve: %v", err)
	}
	if !grant.Granted || len(grant.Reservations) != 1 {
		t.Fatalf("probe not granted: %+v", grant)
	}
	err = store.Settle(t.Context(), grant.Reservations[0], esiclient.Outcome{
		Status:     200,
		Cost:       2,
		ObservedAt: time.Now(),
		Limit:      limit,
		Window:     window,
		Remaining:  limit - 2,
		Metered:    true,
	})
	if err != nil {
		t.Fatalf("probe settle: %v", err)
	}
}

func TestDiscoveryAdmitsOneProbeAndMakesOthersWait(t *testing.T) {
	store, _ := newStore(t)
	bucket := esiclient.Bucket{Group: "market-order", User: esiclient.AnonymousUser}

	first, err := store.Reserve(t.Context(), bucket, esiclient.ClassBackground, marketPolicy, 1)
	if err != nil {
		t.Fatalf("Reserve: %v", err)
	}
	if !first.Granted {
		t.Fatal("the first caller should be allowed to discover the allowance")
	}
	if !first.Reservations[0].Probe {
		t.Error("the discovery slot should be marked as a probe")
	}

	second, err := store.Reserve(t.Context(), bucket, esiclient.ClassBackground, marketPolicy, 1)
	if err != nil {
		t.Fatalf("Reserve: %v", err)
	}
	if second.Granted {
		t.Fatal("a second caller must not also probe an unknown bucket")
	}
	if second.Kind != esiclient.KindDiscovering {
		t.Errorf("Kind = %s, want discovering", second.Kind)
	}
	if second.RetryAt.Before(time.Now()) {
		t.Error("RetryAt should be when the probe gives up")
	}
}

func TestFailedProbeReleasesTheBucketForTheNextCaller(t *testing.T) {
	store, _ := newStore(t)
	bucket := esiclient.Bucket{Group: "industry", User: esiclient.AnonymousUser}

	first, _ := store.Reserve(t.Context(), bucket, esiclient.ClassBackground, marketPolicy, 1)
	if err := store.Release(t.Context(), first.Reservations[0]); err != nil {
		t.Fatalf("Release: %v", err)
	}

	second, err := store.Reserve(t.Context(), bucket, esiclient.ClassBackground, marketPolicy, 1)
	if err != nil {
		t.Fatalf("Reserve: %v", err)
	}
	if !second.Granted {
		t.Fatal("a failed probe must not lock the bucket out of discovery")
	}
}

func TestAllowanceIsLearnedFromTheResponse(t *testing.T) {
	store, _ := newStore(t)
	bucket := esiclient.Bucket{Group: "market-order", User: esiclient.AnonymousUser}
	known(t, store, bucket, 12000, 15*time.Minute)

	state, err := store.State(t.Context(), bucket)
	if err != nil {
		t.Fatalf("State: %v", err)
	}
	if state.Limit != 12000 {
		t.Errorf("Limit = %d, want the figure ESI stated", state.Limit)
	}
	if state.Window != 15*time.Minute {
		t.Errorf("Window = %v, want 15m", state.Window)
	}
	if !state.Metered {
		t.Error("Metered should be true once headers arrived")
	}
	if state.Spent != 2 {
		t.Errorf("Spent = %d, want the settled 2 tokens", state.Spent)
	}
}

func TestChangedAllowanceIsAdoptedInBothDirections(t *testing.T) {
	store, _ := newStore(t)
	bucket := esiclient.Bucket{Group: "market-order", User: esiclient.AnonymousUser}
	known(t, store, bucket, 12000, 15*time.Minute)

	for _, limit := range []int{600, 20000} {
		grant, err := store.Reserve(t.Context(), bucket, esiclient.ClassBackground, marketPolicy, 1)
		if err != nil || !grant.Granted {
			t.Fatalf("Reserve: %v %+v", err, grant)
		}
		err = store.Settle(t.Context(), grant.Reservations[0], esiclient.Outcome{
			Status: 200, Cost: 2, ObservedAt: time.Now(),
			Limit: limit, Window: 15 * time.Minute, Remaining: limit - 4, Metered: true,
		})
		if err != nil {
			t.Fatalf("Settle: %v", err)
		}

		state, _ := store.State(t.Context(), bucket)
		if state.Limit != limit {
			t.Errorf("Limit = %d, want %d adopted on the next response", state.Limit, limit)
		}
	}
}

func TestStaleResponseDoesNotOverwriteAFresherOne(t *testing.T) {
	store, _ := newStore(t)
	bucket := esiclient.Bucket{Group: "market-order", User: esiclient.AnonymousUser}
	known(t, store, bucket, 12000, 15*time.Minute)

	fresh, _ := store.Reserve(t.Context(), bucket, esiclient.ClassBackground, marketPolicy, 1)
	_ = store.Settle(t.Context(), fresh.Reservations[0], esiclient.Outcome{
		Status: 200, Cost: 2, ObservedAt: time.Now(),
		Limit: 12000, Window: 15 * time.Minute, Remaining: 9000, Metered: true,
	})

	slow, _ := store.Reserve(t.Context(), bucket, esiclient.ClassBackground, marketPolicy, 1)
	_ = store.Settle(t.Context(), slow.Reservations[0], esiclient.Outcome{
		Status: 200, Cost: 2, ObservedAt: time.Now().Add(-time.Minute),
		Limit: 12000, Window: 15 * time.Minute, Remaining: 11500, Metered: true,
	})

	state, _ := store.State(t.Context(), bucket)
	if state.Remaining != 9000 {
		t.Errorf("Remaining = %d, want 9000 — a slow response must not rewind the reading", state.Remaining)
	}
}

func TestA429GatesTheBucketForEveryCaller(t *testing.T) {
	store, _ := newStore(t)
	bucket := esiclient.Bucket{Group: "market-order", User: esiclient.AnonymousUser}
	known(t, store, bucket, 12000, 15*time.Minute)

	grant, _ := store.Reserve(t.Context(), bucket, esiclient.ClassBackground, marketPolicy, 1)
	err := store.Settle(t.Context(), grant.Reservations[0], esiclient.Outcome{
		Status: 429, Cost: 0, ObservedAt: time.Now(),
		Limit: 12000, Window: 15 * time.Minute, Remaining: 0,
		RetryAfter: 90 * time.Second, Metered: true,
	})
	if err != nil {
		t.Fatalf("Settle: %v", err)
	}

	next, err := store.Reserve(t.Context(), bucket, esiclient.ClassUserRequested, marketPolicy, 1)
	if err != nil {
		t.Fatalf("Reserve: %v", err)
	}
	if next.Granted {
		t.Fatal("a 429 must stop every class, not just the one that earned it")
	}
	if next.Kind != esiclient.KindGated {
		t.Errorf("Kind = %s, want gated", next.Kind)
	}
	if wait := time.Until(next.RetryAt); wait < 80*time.Second {
		t.Errorf("RetryAt is %v away, want about the stated 90s", wait)
	}
}

func TestSpendingTheBucketReturnsRecoveryNotTheNextSlot(t *testing.T) {
	store, _ := newStore(t)
	bucket := esiclient.Bucket{Group: "industry", User: esiclient.AnonymousUser}
	known(t, store, bucket, 10, time.Minute)

	// Four more 2-token charges exhaust a ten-token allowance.
	for range 4 {
		grant, err := store.Reserve(t.Context(), bucket, esiclient.ClassBackground, marketPolicy, 1)
		if err != nil {
			t.Fatalf("Reserve: %v", err)
		}
		if !grant.Granted {
			break
		}
		_ = store.Settle(t.Context(), grant.Reservations[0], esiclient.Outcome{
			Status: 200, Cost: 2, ObservedAt: time.Now(),
			Limit: 10, Window: time.Minute, Remaining: -1, Metered: true,
		})
	}

	spent, err := store.Reserve(t.Context(), bucket, esiclient.ClassBackground, marketPolicy, 1)
	if err != nil {
		t.Fatalf("Reserve: %v", err)
	}
	if spent.Granted {
		t.Fatal("a spent bucket should refuse")
	}
	if spent.Kind != esiclient.KindDecelerating {
		t.Errorf("Kind = %s, want decelerating", spent.Kind)
	}
	if wait := time.Until(spent.RetryAt); wait < 30*time.Second {
		t.Errorf("RetryAt is %v away; it should be when charges expire, not the next slot", wait)
	}
}

func TestClassFloorSurvivesAnotherClassSaturating(t *testing.T) {
	store, _ := newStore(t)
	bucket := esiclient.Bucket{Group: "market-order", User: esiclient.AnonymousUser}
	known(t, store, bucket, 100, time.Minute)

	// Interactive spends everything it is allowed to.
	for range 40 {
		grant, err := store.Reserve(t.Context(), bucket, esiclient.ClassUserRequested, marketPolicy, 1)
		if err != nil {
			t.Fatalf("Reserve: %v", err)
		}
		if !grant.Granted {
			break
		}
		_ = store.Settle(t.Context(), grant.Reservations[0], esiclient.Outcome{
			Status: 200, Cost: 2, ObservedAt: time.Now(),
			Limit: 100, Window: time.Minute, Remaining: -1, Metered: true,
		})
	}

	bulk, err := store.Reserve(t.Context(), bucket, esiclient.ClassBackground, marketPolicy, 1)
	if err != nil {
		t.Fatalf("Reserve: %v", err)
	}
	if !bulk.Granted {
		t.Fatal("bulk work must keep its floor however hard another class spends")
	}
}

func TestHeadroomIsScopedToTheClass(t *testing.T) {
	store, _ := newStore(t)
	bucket := esiclient.Bucket{Group: "market-order", User: esiclient.AnonymousUser}
	known(t, store, bucket, 1000, 15*time.Minute)

	bulk, err := store.Headroom(t.Context(), bucket, esiclient.ClassBackground)
	if err != nil {
		t.Fatalf("Headroom: %v", err)
	}
	if bulk.Available >= 1000 {
		t.Errorf("bulk sees %d of 1000 — a class must not be told the whole bucket", bulk.Available)
	}
	if bulk.Requests != bulk.Available/2 {
		t.Errorf("Requests = %d, want Available/2 at two tokens a call", bulk.Requests)
	}
	if bulk.Sustained <= 0 {
		t.Error("Sustained should be derived from the observed allowance")
	}

	interactive, _ := store.Headroom(t.Context(), bucket, esiclient.ClassUserRequested)
	if interactive.Available == bulk.Available {
		t.Error("classes with different caps should not see the same headroom")
	}
}

func TestUnmeteredBucketIsPacedWithoutALedger(t *testing.T) {
	store, _ := newStore(t)
	bucket := esiclient.Bucket{Group: "legacy", User: esiclient.AnonymousUser}

	probe, _ := store.Reserve(t.Context(), bucket, esiclient.ClassBackground, marketPolicy, 1)
	err := store.Settle(t.Context(), probe.Reservations[0], esiclient.Outcome{
		Status: 200, Cost: 2, ObservedAt: time.Now(),
		Limit: 1, Window: time.Minute, Remaining: -1, Metered: false,
	})
	if err != nil {
		t.Fatalf("Settle: %v", err)
	}

	for i := range 5 {
		grant, err := store.Reserve(t.Context(), bucket, esiclient.ClassBackground, marketPolicy, 1)
		if err != nil {
			t.Fatalf("Reserve %d: %v", i, err)
		}
		if !grant.Granted {
			t.Fatalf("call %d refused: an unmetered route has no token budget to run out of", i)
		}
	}
}

func TestErrorCounterTripsTheFleetGuard(t *testing.T) {
	store, _ := newStore(t)
	bucket := esiclient.Bucket{Group: "market-order", User: esiclient.AnonymousUser}
	known(t, store, bucket, 12000, 15*time.Minute)

	for range esiclient.DefaultConfig().ErrorLimitStop {
		grant, _ := store.Reserve(t.Context(), bucket, esiclient.ClassBackground, marketPolicy, 1)
		if !grant.Granted {
			break
		}
		_ = store.Settle(t.Context(), grant.Reservations[0], esiclient.Outcome{
			Status: 404, Cost: 5, ObservedAt: time.Now(),
			Limit: 12000, Window: 15 * time.Minute, Remaining: -1, Metered: true,
		})
	}

	count, err := store.ErrorCount(t.Context())
	if err != nil {
		t.Fatalf("ErrorCount: %v", err)
	}
	if count < esiclient.DefaultConfig().ErrorLimitStop {
		t.Fatalf("counted %d errors, want at least the stop threshold", count)
	}

	blocked, err := store.Reserve(t.Context(), bucket, esiclient.ClassUserRequested, marketPolicy, 1)
	if err != nil {
		t.Fatalf("Reserve: %v", err)
	}
	if blocked.Granted {
		t.Fatal("the fleet error guard should stop us before ESI answers 420")
	}
	if blocked.Kind != esiclient.KindErrorLimit {
		t.Errorf("Kind = %s, want error_limit", blocked.Kind)
	}
}

func TestPathToGroupIsLearned(t *testing.T) {
	store, _ := newStore(t)

	if _, found, err := store.GroupFor(t.Context(), "/markets/10000002/orders/"); err != nil || found {
		t.Fatalf("unseen path should not be known: found=%v err=%v", found, err)
	}
	if err := store.LearnGroup(t.Context(), "/markets/10000002/orders/", "market-order"); err != nil {
		t.Fatalf("LearnGroup: %v", err)
	}
	group, found, err := store.GroupFor(t.Context(), "/markets/10000002/orders/")
	if err != nil || !found || group != "market-order" {
		t.Fatalf("GroupFor = %q found=%v err=%v", group, found, err)
	}
}

func TestCanAffordAnswersTheSchedulersQuestion(t *testing.T) {
	store, _ := newStore(t)
	bucket := esiclient.Bucket{Group: "market-order", User: esiclient.AnonymousUser}
	known(t, store, bucket, 1000, 15*time.Minute)

	ok, room, err := store.CanAfford(t.Context(), bucket, esiclient.ClassBackground, 100)
	if err != nil {
		t.Fatalf("CanAfford: %v", err)
	}
	if !ok {
		t.Errorf("bulk should afford 100 tokens of a 1000 bucket, saw %d", room.Available)
	}

	if ok, _, _ := store.CanAfford(t.Context(), bucket, esiclient.ClassBackground, 100000); ok {
		t.Error("nothing affords more than the bucket holds")
	}

	// A gated bucket affords nothing, whatever the ledger says.
	grant, _ := store.Reserve(t.Context(), bucket, esiclient.ClassBackground, marketPolicy, 1)
	_ = store.Settle(t.Context(), grant.Reservations[0], esiclient.Outcome{
		Status: 429, ObservedAt: time.Now(), Limit: 1000, Window: 15 * time.Minute,
		Remaining: 0, RetryAfter: time.Minute, Metered: true,
	})
	if ok, _, _ := store.CanAfford(t.Context(), bucket, esiclient.ClassBackground, 1); ok {
		t.Error("a gated bucket affords nothing")
	}
}

func TestUnknownBucketAffordsNothingYet(t *testing.T) {
	store, _ := newStore(t)
	bucket := esiclient.Bucket{Group: "never-seen", User: esiclient.AnonymousUser}

	room, err := store.Headroom(t.Context(), bucket, esiclient.ClassBackground)
	if err != nil {
		t.Fatalf("Headroom: %v", err)
	}
	if room.Available != 0 {
		t.Errorf("Available = %d before any response disclosed the allowance", room.Available)
	}
}

func TestClassCapDoesNotLookLikeAnEmptyBucket(t *testing.T) {
	store, _ := newStore(t)
	bucket := esiclient.Bucket{Group: "market-order", User: esiclient.AnonymousUser}
	known(t, store, bucket, 1000, time.Minute)

	// A class may hold only its share of a bucket, but that is a ceiling on the
	// share — not a statement that the bank is low. Pacing follows the bucket's
	// own occupancy, so a caller on an almost untouched bucket bursts even
	// though its class cap is well under 1.
	policy := marketPolicy
	policy.MinSpacing = 10 * time.Millisecond

	grant, err := store.Reserve(t.Context(), bucket, esiclient.ClassBackground, policy, 4)
	if err != nil {
		t.Fatalf("Reserve: %v", err)
	}
	if !grant.Granted || len(grant.Reservations) != 4 {
		t.Fatalf("expected four slots, got %+v", grant)
	}

	// Slots should be about MinSpacing apart. If fill were read from the class
	// share instead of the bucket, the glide would already have stretched these
	// toward the sustained interval of two seconds.
	spread := grant.Reservations[3].Slot.Sub(grant.Reservations[0].Slot)
	if spread > 250*time.Millisecond {
		t.Errorf("four slots spread over %v on a nearly empty bucket; the glide is reading the class cap as a low bank", spread)
	}
}

func TestGlideStretchesOnceTheBucketIsActuallyLow(t *testing.T) {
	// One class allowed nearly the whole bucket, so the bank can genuinely be
	// drained; otherwise the class cap refuses the caller long before fill falls
	// far enough for the glide to show.
	cfg := esiclient.DefaultConfig()
	cfg.Floors = []esiclient.ClassFloor{{Class: esiclient.ClassUserRequested, Floor: 0.95}}
	// State the glide point rather than inheriting it: this test is about the
	// curve, and should not start passing or failing when the default is tuned.
	cfg.GlideFrom = 0.6
	store := esiclient.NewStore(redisfake.New(t).Client, cfg)

	bucket := esiclient.Bucket{Group: "market-order", User: esiclient.AnonymousUser}
	known(t, store, bucket, 100, time.Minute)

	policy := marketPolicy
	policy.MinSpacing = 10 * time.Millisecond

	early, err := store.Reserve(t.Context(), bucket, esiclient.ClassUserRequested, policy, 2)
	if err != nil || !early.Granted {
		t.Fatalf("early reserve: %v %+v", err, early)
	}
	earlySpread := early.Reservations[1].Slot.Sub(early.Reservations[0].Slot)

	// Drain past the glide threshold but not to the wall, so the next reserve is
	// granted and its spacing can be compared.
	for range 28 {
		grant, err := store.Reserve(t.Context(), bucket, esiclient.ClassUserRequested, policy, 1)
		if err != nil || !grant.Granted {
			break
		}
		_ = store.Settle(t.Context(), grant.Reservations[0], esiclient.Outcome{
			Status: 200, Cost: 2, ObservedAt: time.Now(),
			Limit: 100, Window: time.Minute, Remaining: -1, Metered: true,
		})
	}

	late, err := store.Reserve(t.Context(), bucket, esiclient.ClassUserRequested, policy, 2)
	if err != nil {
		t.Fatalf("late reserve: %v", err)
	}
	if !late.Granted {
		t.Fatalf("bucket refused before the glide could be observed: %s", late.Kind)
	}
	lateSpread := late.Reservations[1].Slot.Sub(late.Reservations[0].Slot)

	if lateSpread <= earlySpread {
		t.Errorf("spacing %v when low against %v when full; the glide should stretch as the bank drains",
			lateSpread, earlySpread)
	}
}

func TestDowntimeIsObservedNotScheduled(t *testing.T) {
	store, _ := newStore(t)
	bucket := esiclient.Bucket{Group: "market-order", User: esiclient.AnonymousUser}
	known(t, store, bucket, 12000, 15*time.Minute)

	// Tranquility stops answering, which fails every bucket rather than one.
	// Failures spread across buckets are what conclude an outage.
	other := esiclient.Bucket{Group: "industry", User: esiclient.AnonymousUser}
	known(t, store, other, 150, 15*time.Minute)

	for _, target := range []esiclient.Bucket{bucket, other, bucket} {
		grant, err := store.Reserve(t.Context(), target, esiclient.ClassBackground, marketPolicy, 1)
		if err != nil {
			t.Fatalf("Reserve: %v", err)
		}
		if !grant.Granted {
			break
		}
		_ = store.SettleUnreachable(t.Context(), grant.Reservations[0])
	}

	state, err := store.Downtime(t.Context())
	if err != nil {
		t.Fatalf("Downtime: %v", err)
	}
	if !state.Gated {
		t.Fatalf("unanswered calls across buckets should conclude the server is away: %+v", state)
	}

	// While gated, exactly one caller probes and the rest are told when.
	first, err := store.Reserve(t.Context(), bucket, esiclient.ClassBackground, marketPolicy, 1)
	if err != nil {
		t.Fatalf("Reserve: %v", err)
	}
	if first.Granted {
		t.Fatal("the gate should hold until the backoff expires")
	}
	if first.Kind != esiclient.KindDowntime {
		t.Errorf("Kind = %s, want downtime", first.Kind)
	}
	if first.RetryAt.Before(time.Now()) {
		t.Error("RetryAt should be the next probe, not a time already passed")
	}
}

func TestAnAnswerOfAnyKindClearsDowntime(t *testing.T) {
	store, _ := newStore(t)
	bucket := esiclient.Bucket{Group: "market-order", User: esiclient.AnonymousUser}
	known(t, store, bucket, 12000, 15*time.Minute)

	other := esiclient.Bucket{Group: "industry", User: esiclient.AnonymousUser}
	known(t, store, other, 150, 15*time.Minute)
	for _, target := range []esiclient.Bucket{bucket, other, bucket} {
		grant, _ := store.Reserve(t.Context(), target, esiclient.ClassBackground, marketPolicy, 1)
		if !grant.Granted {
			break
		}
		_ = store.SettleUnreachable(t.Context(), grant.Reservations[0])
	}
	if state, _ := store.Downtime(t.Context()); !state.Gated {
		t.Fatal("expected the gate to be closed")
	}

	// A 404 is not a welcome answer, but it is an answer: the server is up. The
	// gate must clear on that rather than waiting out a window.
	probe := esiclient.Reservation{
		ID: "probe", Bucket: bucket, Class: esiclient.ClassBackground, Endpoint: marketPolicy.Pattern,
	}
	err := store.Settle(t.Context(), probe, esiclient.Outcome{
		Attempted: true, Status: 404, Cost: 5, ObservedAt: time.Now(),
		Limit: 12000, Window: 15 * time.Minute, Remaining: -1, Metered: true,
	})
	if err != nil {
		t.Fatalf("Settle: %v", err)
	}

	state, _ := store.Downtime(t.Context())
	if state.Gated {
		t.Error("the server answered, so the gate should be open however unwelcome the answer")
	}

	if grant, err := store.Reserve(t.Context(), bucket, esiclient.ClassBackground, marketPolicy, 1); err != nil || !grant.Granted {
		t.Errorf("calls should resume at once: granted=%v kind=%s err=%v", grant.Granted, grant.Kind, err)
	}
}

func TestAReleasedReservationSaysNothingAboutAvailability(t *testing.T) {
	store, _ := newStore(t)
	bucket := esiclient.Bucket{Group: "market-order", User: esiclient.AnonymousUser}
	known(t, store, bucket, 12000, 15*time.Minute)

	// Releases are requests that never left. However many there are, they are
	// not evidence that Tranquility is away.
	for range 10 {
		grant, err := store.Reserve(t.Context(), bucket, esiclient.ClassBackground, marketPolicy, 1)
		if err != nil || !grant.Granted {
			t.Fatalf("Reserve: %v %+v", err, grant)
		}
		if err := store.Release(t.Context(), grant.Reservations[0]); err != nil {
			t.Fatalf("Release: %v", err)
		}
	}

	if state, _ := store.Downtime(t.Context()); state.Gated {
		t.Error("releases were mistaken for the server failing to answer")
	}
}

func TestNoClockDecidesWhetherTheServersAreUp(t *testing.T) {
	store, _ := newStore(t)
	bucket := esiclient.Bucket{Group: "market-order", User: esiclient.AnonymousUser}
	known(t, store, bucket, 12000, 15*time.Minute)

	// Whatever the time of day, a server that answers is called. Nothing in the
	// limiter knows when CCP says downtime is, so nothing can be wrong about it.
	for range 3 {
		grant, err := store.Reserve(t.Context(), bucket, esiclient.ClassBackground, marketPolicy, 1)
		if err != nil {
			t.Fatalf("Reserve: %v", err)
		}
		if !grant.Granted {
			t.Fatalf("a healthy bucket refused: %s", grant.Kind)
		}
		_ = store.Settle(t.Context(), grant.Reservations[0], esiclient.Outcome{
			Attempted: true, Status: 200, Cost: 2, ObservedAt: time.Now(),
			Limit: 12000, Window: 15 * time.Minute, Remaining: -1, Metered: true,
		})
	}

	if state, _ := store.Downtime(t.Context()); state.Gated {
		t.Error("the servers were answering; nothing should have gated them")
	}
}

func TestOneFailingEndpointDoesNotGateTheFleet(t *testing.T) {
	store, _ := newStore(t)
	bucket := esiclient.Bucket{Group: "characters", User: esiclient.AnonymousUser}
	known(t, store, bucket, 600, 15*time.Minute)

	// One endpoint answering 5xx over and over is that endpoint, not
	// Tranquility. Retries alone must not conclude an outage, or a single bad
	// call in a login would stop every refresh the worker has.
	for range 4 {
		grant, err := store.Reserve(t.Context(), bucket, esiclient.ClassBackground, marketPolicy, 1)
		if err != nil {
			t.Fatalf("Reserve: %v", err)
		}
		if !grant.Granted {
			t.Fatalf("the bucket refused before the point could be made: %s", grant.Kind)
		}
		_ = store.SettleUnreachable(t.Context(), grant.Reservations[0])
	}

	state, err := store.Downtime(t.Context())
	if err != nil {
		t.Fatalf("Downtime: %v", err)
	}
	if state.Gated {
		t.Error("one endpoint failing its retries gated the whole fleet")
	}

	// A fleet whose only traffic is that endpoint still concludes an outage
	// eventually — it just takes more evidence.
	for range 8 {
		grant, err := store.Reserve(t.Context(), bucket, esiclient.ClassBackground, marketPolicy, 1)
		if err != nil || !grant.Granted {
			break
		}
		_ = store.SettleUnreachable(t.Context(), grant.Reservations[0])
	}
	if state, _ := store.Downtime(t.Context()); !state.Gated {
		t.Error("sustained failure on the only endpoint in use should still conclude an outage")
	}
}

// Work that an outage stops but that ESI does not meter — SSO token rotation —
// reads and feeds the same gate without holding a bucket. What has to hold is
// that it costs nothing, that it counts as a source in its own right, and that
// it agrees with the metered path about what "answering" means.

func TestObserveHoldsNoBucketAndSpendsNothing(t *testing.T) {
	store, fake := newStore(t)

	for range 5 {
		if err := store.Observe(t.Context(), "evesso", false); err != nil {
			t.Fatalf("Observe: %v", err)
		}
	}

	// No bucket state, no ledger, no token: the only thing touched is the gate.
	keys, err := fake.Client.Keys(t.Context(), "esi:b:*").Result()
	if err != nil {
		t.Fatalf("scan: %v", err)
	}
	if len(keys) != 0 {
		t.Errorf("observing created bucket state %v; SSO holds no bucket", keys)
	}
}

func TestSSOAndESIFailingTogetherConcludeAnOutage(t *testing.T) {
	store, _ := newStore(t)
	bucket := esiclient.Bucket{Group: "market-order", User: esiclient.AnonymousUser}
	known(t, store, bucket, 12000, 15*time.Minute)

	// ESI failing on its own is one source and not enough. This is the case that
	// stops one bad endpoint gating the fleet.
	for range 3 {
		grant, err := store.Reserve(t.Context(), bucket, esiclient.ClassBackground, marketPolicy, 1)
		if err != nil || !grant.Granted {
			t.Fatalf("Reserve: %v %+v", err, grant)
		}
		_ = store.SettleUnreachable(t.Context(), grant.Reservations[0])
	}
	if state, _ := store.Downtime(t.Context()); state.Gated {
		t.Fatal("one source failing should not conclude an outage on its own")
	}

	// SSO failing too is a second, independent source — which is what an outage
	// actually looks like, and is the evidence the gate is waiting for.
	if err := store.Observe(t.Context(), "evesso", false); err != nil {
		t.Fatalf("Observe: %v", err)
	}

	state, err := store.Downtime(t.Context())
	if err != nil {
		t.Fatalf("Downtime: %v", err)
	}
	if !state.Gated {
		t.Errorf("ESI and SSO both failing should conclude an outage: %+v", state)
	}
}

func TestSSOAnsweringClearsAGateESIFailuresClosed(t *testing.T) {
	store, _ := newStore(t)
	bucket := esiclient.Bucket{Group: "market-order", User: esiclient.AnonymousUser}
	known(t, store, bucket, 12000, 15*time.Minute)

	for range 3 {
		grant, _ := store.Reserve(t.Context(), bucket, esiclient.ClassBackground, marketPolicy, 1)
		if !grant.Granted {
			break
		}
		_ = store.SettleUnreachable(t.Context(), grant.Reservations[0])
	}
	_ = store.Observe(t.Context(), "evesso", false)
	if state, _ := store.Downtime(t.Context()); !state.Gated {
		t.Fatal("expected the gate to be closed before testing recovery")
	}

	// SSO answering means the servers are back, whichever source noticed first.
	// Recovery must not require the same source that reported the failure.
	if err := store.Observe(t.Context(), "evesso", true); err != nil {
		t.Fatalf("Observe: %v", err)
	}

	state, _ := store.Downtime(t.Context())
	if state.Gated {
		t.Error("SSO answering should reopen the gate for everyone")
	}

	grant, err := store.Reserve(t.Context(), bucket, esiclient.ClassBackground, marketPolicy, 1)
	if err != nil {
		t.Fatalf("Reserve: %v", err)
	}
	if !grant.Granted {
		t.Errorf("ESI calls should resume once anything answers: %s", grant.Kind)
	}
}

func TestObserveAndSettleAgreeOnWhatAnsweringMeans(t *testing.T) {
	// The two share one set of rules; this holds them to it. A metered call and
	// an unmetered one that both succeeded must leave the gate in the same state,
	// and likewise when both failed.
	viaSettle, _ := newStore(t)
	viaObserve, _ := newStore(t)

	bucket := esiclient.Bucket{Group: "market-order", User: esiclient.AnonymousUser}
	known(t, viaSettle, bucket, 12000, 15*time.Minute)

	failWith := func(store *esiclient.Store, metered bool) {
		for range esiclient.LoneSourceFailures() {
			if !metered {
				_ = store.Observe(t.Context(), "evesso", false)
				continue
			}
			grant, _ := store.Reserve(t.Context(), bucket, esiclient.ClassBackground, marketPolicy, 1)
			if !grant.Granted {
				return
			}
			_ = store.SettleUnreachable(t.Context(), grant.Reservations[0])
		}
	}

	failWith(viaSettle, true)
	failWith(viaObserve, false)

	settled, _ := viaSettle.Downtime(t.Context())
	observed, _ := viaObserve.Downtime(t.Context())
	if settled.Gated != observed.Gated {
		t.Errorf("sustained failure gated=%v through a metered call but gated=%v through an unmetered one",
			settled.Gated, observed.Gated)
	}
	if !observed.Gated {
		t.Error("sustained failure from the only source in use should conclude an outage either way")
	}
}

// An operator reset must not become a way to overspend. Forget drops the
// learned allowance, which the next call relearns for free; the ledger records
// spend inside a window ESI is still counting, and dropping that would let
// every replica spend the same budget twice.

func TestForgetDropsTheAllowanceAndKeepsTheLedger(t *testing.T) {
	store, _ := newStore(t)
	bucket := esiclient.Bucket{Group: "market-order", User: esiclient.AnonymousUser}
	known(t, store, bucket, 12000, 15*time.Minute)

	before, err := store.State(t.Context(), bucket)
	if err != nil {
		t.Fatalf("State: %v", err)
	}
	if before.Spent == 0 {
		t.Fatal("nothing was spent, so there is no ledger to protect")
	}

	if _, err := store.Forget(t.Context(), bucket); err != nil {
		t.Fatalf("Forget: %v", err)
	}

	after, err := store.State(t.Context(), bucket)
	if err != nil {
		t.Fatalf("State: %v", err)
	}
	if after.Known() {
		t.Errorf("the allowance survived Forget (limit %d); it should be relearned from the next call", after.Limit)
	}
	// Metering must survive: clear it and the limiter stops consulting the
	// ledger at all, which spends without accounting just as an empty ledger
	// would.
	if !after.Metered {
		t.Error("Forget cleared the metered flag, so the surviving ledger is no longer consulted")
	}
	if after.Spent != before.Spent {
		t.Errorf("spend went from %d to %d; the ledger must survive a reset or the budget is spent twice",
			before.Spent, after.Spent)
	}
}

func TestBucketsReportsWhatTheFleetHasLearned(t *testing.T) {
	store, _ := newStore(t)
	orders := esiclient.Bucket{Group: "market-order", User: esiclient.AnonymousUser}
	industry := esiclient.Bucket{Group: "industry", User: esiclient.AnonymousUser}
	known(t, store, orders, 12000, 15*time.Minute)
	known(t, store, industry, 150, 15*time.Minute)

	found, err := store.Buckets(t.Context())
	if err != nil {
		t.Fatalf("Buckets: %v", err)
	}

	keys := make([]string, 0, len(found))
	for _, b := range found {
		keys = append(keys, b.Key())
	}
	if !slices.Contains(keys, orders.Key()) || !slices.Contains(keys, industry.Key()) {
		t.Errorf("Buckets() = %v, want both %s and %s", keys, orders.Key(), industry.Key())
	}
	// The group and user must survive the round trip through the key, or the
	// CLI and gauges label the wrong thing.
	for _, b := range found {
		if b.Group == "" || b.User == "" {
			t.Errorf("bucket %+v lost part of its identity when read back", b)
		}
	}
	if !slices.IsSorted(keys) {
		t.Errorf("Buckets() = %v, want a stable order for the operator listing", keys)
	}
}

func TestABucketRediscoversItsAllowanceAfterForget(t *testing.T) {
	store, _ := newStore(t)
	bucket := esiclient.Bucket{Group: "market-order", User: esiclient.AnonymousUser}
	known(t, store, bucket, 12000, 15*time.Minute)

	if _, err := store.Forget(t.Context(), bucket); err != nil {
		t.Fatalf("Forget: %v", err)
	}

	// With no allowance the bucket is back in discovery: one caller is admitted
	// to find out what it is, so a reset does not leave the bucket stuck.
	grant, err := store.Reserve(t.Context(), bucket, esiclient.ClassBackground, marketPolicy, 1)
	if err != nil {
		t.Fatalf("Reserve: %v", err)
	}
	if !grant.Granted {
		t.Fatalf("a reset bucket refused every caller (%s), so nothing can relearn the allowance", grant.Kind)
	}
	if !grant.Reservations[0].Probe {
		t.Error("the admitted caller should be a probe, so the rest wait rather than stampede")
	}
}

func TestAnUndisclosedAllowanceAffordsTheWork(t *testing.T) {
	// The state every deploy starts in: callers know what work costs, but no
	// response has yet said what the bucket allows. Refusing here deadlocks —
	// the allowance is only ever learned from a call, so waiting for a budget
	// before calling waits forever.
	store, _ := newStore(t)
	bucket := esiclient.Bucket{Group: "market-order", User: esiclient.AnonymousUser}

	room, err := store.Headroom(t.Context(), bucket, esiclient.ClassBackground)
	if err != nil {
		t.Fatalf("Headroom: %v", err)
	}
	if room.Known {
		t.Fatal("an untouched bucket reported a known allowance")
	}
	if room.Available != 0 {
		t.Errorf("Available = %d, want 0 when nothing has been disclosed", room.Available)
	}

	afford, room, err := store.CanAfford(t.Context(), bucket, esiclient.ClassBackground, 370)
	if err != nil {
		t.Fatalf("CanAfford: %v", err)
	}
	if !afford {
		t.Error("an undisclosed allowance refused the work, which nothing could ever recover from")
	}
	if room.Known {
		t.Error("CanAfford reported the allowance as known")
	}

	// Once a response has spoken, the figure is enforced.
	known(t, store, bucket, 12000, 15*time.Minute)
	if afford, room, _ := store.CanAfford(t.Context(), bucket, esiclient.ClassBackground, 500000); afford {
		t.Errorf("a %d-token run was afforded against a 12000 allowance (%+v)", 500000, room)
	}
	if afford, _, _ := store.CanAfford(t.Context(), bucket, esiclient.ClassBackground, 10); !afford {
		t.Error("a small run was refused against a fresh 12000 allowance")
	}
}

func TestAGatedBucketAffordsNothing(t *testing.T) {
	// Downtime still refuses, disclosed allowance or not — that is a different
	// question from whether the budget is known.
	store, _ := newStore(t)
	bucket := esiclient.Bucket{Group: "market-order", User: esiclient.AnonymousUser}
	known(t, store, bucket, 12000, 15*time.Minute)

	grant, err := store.Reserve(t.Context(), bucket, esiclient.ClassBackground, marketPolicy, 1)
	if err != nil || !grant.Granted {
		t.Fatalf("Reserve: %v %+v", err, grant)
	}
	if err := store.Settle(t.Context(), grant.Reservations[0], esiclient.Outcome{
		Attempted: true, Status: 429, ObservedAt: time.Now(),
		RetryAfter: time.Minute, Limit: 12000, Window: 15 * time.Minute, Metered: true,
	}); err != nil {
		t.Fatalf("Settle: %v", err)
	}

	afford, room, err := store.CanAfford(t.Context(), bucket, esiclient.ClassBackground, 1)
	if err != nil {
		t.Fatalf("CanAfford: %v", err)
	}
	if afford && !room.GatedUntil.IsZero() {
		t.Error("a gated bucket afforded work")
	}
}
