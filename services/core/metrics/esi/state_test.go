package esi_test

import (
	"testing"
	"time"

	esimetrics "eve-industry-planner/core/metrics/esi"
	"eve-industry-planner/shared/esiclient"
	"eve-industry-planner/testing/redisfake"
)

// storeWithBucket returns a store holding one bucket whose allowance a response
// has disclosed.
func storeWithBucket(t *testing.T, group string, user string, limit int) *esiclient.Store {
	t.Helper()
	store := esiclient.NewStore(redisfake.New(t).Client, esiclient.DefaultConfig())
	bucket := esiclient.Bucket{Group: group, User: user}

	grant, err := store.Reserve(t.Context(), bucket, esiclient.ClassBackground, esiclient.EndpointPolicy{}, 1)
	if err != nil || !grant.Granted {
		t.Fatalf("probe reserve: %v %+v", err, grant)
	}
	if err := store.Settle(t.Context(), grant.Reservations[0], esiclient.Outcome{
		Attempted: true, Status: 200, Cost: esiclient.SuccessCost, ObservedAt: time.Now(),
		Limit: limit, Window: 15 * time.Minute, Remaining: limit - esiclient.SuccessCost, Metered: true,
	}); err != nil {
		t.Fatalf("probe settle: %v", err)
	}
	return store
}

func TestReadDescribesABucketAnOperatorCanAct(t *testing.T) {
	store := storeWithBucket(t, "market-order", esiclient.AnonymousUser, 12000)

	rows, err := esimetrics.Read(t.Context(), store, time.Now())
	if err != nil {
		t.Fatalf("Read: %v", err)
	}
	if len(rows) != 1 {
		t.Fatalf("read %d buckets, want 1", len(rows))
	}

	row := rows[0]
	if row.Group != "market-order" {
		t.Errorf("Group = %q", row.Group)
	}
	if !row.Known {
		t.Error("a bucket whose allowance was disclosed reported unknown")
	}
	if row.TokenLimit != 12000 {
		t.Errorf("TokenLimit = %d, want the figure ESI stated", row.TokenLimit)
	}
	if row.TokenUsed != esiclient.SuccessCost {
		t.Errorf("TokenUsed = %d, want the settled %d", row.TokenUsed, esiclient.SuccessCost)
	}
	if row.TokenRemaining != 12000-esiclient.SuccessCost {
		t.Errorf("TokenRemaining = %d", row.TokenRemaining)
	}
	if row.Fill <= 0.99 || row.Fill > 1 {
		t.Errorf("Fill = %v, want just under 1 on a barely-touched bucket", row.Fill)
	}
}

func TestReadNeverLabelsACharacterID(t *testing.T) {
	// A character id as a label is an unbounded metric dimension, so the scope
	// says which kind of bucket it is and nothing more.
	store := storeWithBucket(t, "characters", "char:91316135", 150)

	rows, err := esimetrics.Read(t.Context(), store, time.Now())
	if err != nil {
		t.Fatalf("Read: %v", err)
	}
	if len(rows) != 1 {
		t.Fatalf("read %d buckets, want 1", len(rows))
	}
	if rows[0].Scope != "character" {
		t.Errorf("Scope = %q, want a character-scoped bucket", rows[0].Scope)
	}
	if rows[0].Group != "characters" {
		t.Errorf("Group = %q", rows[0].Group)
	}
}

func TestReadReportsAnUndiscoveredBucketAsUnknown(t *testing.T) {
	// Nothing supplies an allowance in code, so a bucket nothing has called has
	// none — and a gauge must not publish a fill derived from zero.
	store := esiclient.NewStore(redisfake.New(t).Client, esiclient.DefaultConfig())
	bucket := esiclient.Bucket{Group: "market-order", User: esiclient.AnonymousUser}
	if _, err := store.Reserve(t.Context(), bucket, esiclient.ClassBackground, esiclient.EndpointPolicy{}, 1); err != nil {
		t.Fatalf("Reserve: %v", err)
	}

	rows, err := esimetrics.Read(t.Context(), store, time.Now())
	if err != nil {
		t.Fatalf("Read: %v", err)
	}
	for _, row := range rows {
		if row.Known {
			t.Errorf("%s reported a known allowance of %d before anything answered", row.Group, row.TokenLimit)
		}
		if row.Fill != 0 {
			t.Errorf("%s reported fill %v with no allowance to divide by", row.Group, row.Fill)
		}
	}
}

// applyReconciliation runs the reserve script, which is where the ledger is
// squared against ESI's own count, and hands the slot straight back so only the
// correction is left behind.
func applyReconciliation(t *testing.T, store *esiclient.Store, b esiclient.Bucket) {
	t.Helper()
	grant, err := store.Reserve(t.Context(), b, esiclient.ClassBackground, esiclient.EndpointPolicy{}, 1)
	if err != nil {
		t.Fatalf("Reserve: %v", err)
	}
	for _, r := range grant.Reservations {
		if err := store.Release(t.Context(), r); err != nil {
			t.Fatalf("Release: %v", err)
		}
	}
}

// spendAndReport settles one call that spends cost and has ESI reply with
// reportedRemaining, observed at observedAt.
func spendAndReport(t *testing.T, store *esiclient.Store, b esiclient.Bucket, limit, cost, reportedRemaining int, observedAt time.Time) {
	t.Helper()
	grant, err := store.Reserve(t.Context(), b, esiclient.ClassBackground, esiclient.EndpointPolicy{}, 1)
	if err != nil || !grant.Granted {
		t.Fatalf("Reserve: %v %+v", err, grant)
	}
	if err := store.Settle(t.Context(), grant.Reservations[0], esiclient.Outcome{
		Attempted: true, Status: 200, Cost: cost, ObservedAt: observedAt,
		Limit: limit, Window: 15 * time.Minute, Remaining: reportedRemaining, Metered: true,
	}); err != nil {
		t.Fatalf("Settle: %v", err)
	}
}

func TestUnaccountedIsWhatESIChargedAndWeDidNot(t *testing.T) {
	// Our ledger is reconciled to ESI on every response, so the two counts agree
	// and subtracting them measures nothing. What is worth reporting is how much
	// of our count came from that reconciliation rather than from calls we made.
	store := esiclient.NewStore(redisfake.New(t).Client, esiclient.DefaultConfig())
	bucket := esiclient.Bucket{Group: "market-order", User: esiclient.AnonymousUser}
	now := time.Now()

	// We spent 2. ESI says a thousand are gone.
	spendAndReport(t, store, bucket, 12000, 2, 11000, now)
	applyReconciliation(t, store, bucket)

	rows, err := esimetrics.Read(t.Context(), store, now)
	if err != nil {
		t.Fatalf("Read: %v", err)
	}
	row := rows[0]

	if row.Unaccounted != 998 {
		t.Errorf("Unaccounted = %d, want the 998 ESI charged that we never recorded", row.Unaccounted)
	}
	if row.TokenUsed != 1000 {
		t.Errorf("TokenUsed = %d, want our ledger reconciled to ESI's 1000", row.TokenUsed)
	}
	if row.TokenRemaining != row.ReportedRemaining {
		t.Errorf("our remaining %d and ESI's %d disagree after reconciliation",
			row.TokenRemaining, row.ReportedRemaining)
	}
}

func TestNothingIsUnaccountedWhenTheCountsAlreadyAgree(t *testing.T) {
	store := esiclient.NewStore(redisfake.New(t).Client, esiclient.DefaultConfig())
	bucket := esiclient.Bucket{Group: "market-order", User: esiclient.AnonymousUser}
	now := time.Now()

	spendAndReport(t, store, bucket, 12000, 2, 11998, now)
	applyReconciliation(t, store, bucket)

	rows, _ := esimetrics.Read(t.Context(), store, now)
	if rows[0].Unaccounted != 0 {
		t.Errorf("Unaccounted = %d, want 0 when ESI's count matches ours", rows[0].Unaccounted)
	}
}

func TestAStaleHeaderIsNotComparedAgainst(t *testing.T) {
	// The trap: an idle bucket's spend decays towards zero while ESI's last
	// figure stays frozen, so the pair would show drift growing on its own. That
	// is the clock moving, not the fleet disagreeing with CCP.
	store := esiclient.NewStore(redisfake.New(t).Client, esiclient.DefaultConfig())
	bucket := esiclient.Bucket{Group: "market-order", User: esiclient.AnonymousUser}
	observed := time.Now()

	spendAndReport(t, store, bucket, 12000, 2, 11000, observed)

	// Read an hour on, well past the window the header describes.
	rows, err := esimetrics.Read(t.Context(), store, observed.Add(time.Hour))
	if err != nil {
		t.Fatalf("Read: %v", err)
	}
	if rows[0].Comparable {
		t.Error("a header an hour old was compared against; the drift would be the clock, not a disagreement")
	}
	if rows[0].ReportedRemaining != 0 {
		t.Errorf("a stale figure was still reported: %d", rows[0].ReportedRemaining)
	}
}

func TestAGenerousHeaderLeavesOurSpendStanding(t *testing.T) {
	// ESI reporting more left than we hold is the safe direction, and never a
	// reason to credit charges back or to call the difference unaccounted.
	store := esiclient.NewStore(redisfake.New(t).Client, esiclient.DefaultConfig())
	bucket := esiclient.Bucket{Group: "market-order", User: esiclient.AnonymousUser}
	now := time.Now()

	spendAndReport(t, store, bucket, 12000, 500, 12000, now)
	applyReconciliation(t, store, bucket)

	rows, err := esimetrics.Read(t.Context(), store, now)
	if err != nil {
		t.Fatalf("Read: %v", err)
	}
	if rows[0].TokenUsed < 500 {
		t.Errorf("TokenUsed = %d; a generous header must not erase spend we recorded", rows[0].TokenUsed)
	}
	if rows[0].Unaccounted != 0 {
		t.Errorf("Unaccounted = %d, want 0 when ESI is the generous one", rows[0].Unaccounted)
	}
}
