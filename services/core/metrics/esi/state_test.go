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
