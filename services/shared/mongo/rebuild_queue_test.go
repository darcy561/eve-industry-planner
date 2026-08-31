package mongo

import (
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

func TestNewMongoBindsStatisticsCollections(t *testing.T) {
	t.Parallel()
	m := testMongo(t)

	for _, tc := range []struct {
		name string
		docs *Docs
		want string
	}{
		{"ArchivedJobStats", m.ArchivedJobStats, CollectionArchivedJobStats},
		{"AccountTimelineMonths", m.AccountTimelineMonths, CollectionAccountTimelineMonths},
		{"AccountRebuildQueue", m.AccountRebuildQueue, CollectionAccountRebuildQueue},
	} {
		if tc.docs == nil || tc.docs.Collection() == nil {
			t.Fatalf("%s: handle not bound", tc.name)
		}
		if got := tc.docs.Collection().Name(); got != tc.want {
			t.Fatalf("%s: collection = %q, want %q", tc.name, got, tc.want)
		}
		if got := tc.docs.Collection().Database().Name(); got != DatabaseName {
			t.Fatalf("%s: database = %q, want %q", tc.name, got, DatabaseName)
		}
	}
}

func TestRebuildQueueRequiresHandleAndAccount(t *testing.T) {
	t.Parallel()
	var nilMongo *Mongo

	if err := nilMongo.QueueAccountRebuild(t.Context(), "acct", time.Time{}); err == nil {
		t.Fatal("expected an error without a mongo handle")
	}
	if _, err := nilMongo.ListQueuedAccounts(t.Context()); err == nil {
		t.Fatal("expected an error without a mongo handle")
	}
	if _, err := nilMongo.ClearQueuedAccounts(t.Context(), []QueuedAccount{{AccountID: "acct"}}); err == nil {
		t.Fatal("expected an error without a mongo handle")
	}

	m := testMongo(t)
	if err := m.QueueAccountRebuild(t.Context(), "", time.Time{}); err == nil {
		t.Fatal("expected an error for an empty accountID")
	}
}

// Clearing nothing must not reach Mongo at all, so a drain that found no work is free.
func TestClearQueuedAccountsWithNoIDsIsANoop(t *testing.T) {
	t.Parallel()
	m := testMongo(t)

	deleted, err := m.ClearQueuedAccounts(t.Context(), nil)
	if err != nil {
		t.Fatalf("ClearQueuedAccounts: %v", err)
	}
	if deleted != 0 {
		t.Fatalf("deleted = %d, want 0", deleted)
	}
}

func TestDocsReadHelpersValidateInput(t *testing.T) {
	t.Parallel()
	var nilDocs *Docs

	if _, err := nilDocs.DistinctStrings(t.Context(), "field", nil); err == nil {
		t.Fatal("expected an error on a nil collection")
	}
	if _, err := nilDocs.ListIDs(t.Context(), nil); err == nil {
		t.Fatal("expected an error on a nil collection")
	}

	m := testMongo(t)
	if _, err := m.ArchivedJobStats.DistinctStrings(t.Context(), "", nil); err == nil {
		t.Fatal("expected an error for an empty field name")
	}
}

func TestStatisticsDocumentIDs(t *testing.T) {
	t.Parallel()

	if got := AccountProductionTotalsDocumentID("acct", 1234); got != "acct|1234" {
		t.Fatalf("AccountProductionTotalsDocumentID = %q", got)
	}
	if got := ArchivedJobStatsDocumentID("acct", "job-1"); got != "acct|job-1" {
		t.Fatalf("ArchivedJobStatsDocumentID = %q", got)
	}
	if got := AccountTimelineMonthDocumentID("acct", 1234, 2026, 8, false); got != "acct|1234|2026-08" {
		t.Fatalf("AccountTimelineMonthDocumentID = %q, want acct|1234|2026-08", got)
	}
}

// The month segment is zero padded so _id ordering matches calendar ordering.
func TestAccountTimelineMonthDocumentIDPadsMonth(t *testing.T) {
	t.Parallel()

	if got := AccountTimelineMonthDocumentID("acct", 1, 2026, 12, false); got != "acct|1|2026-12" {
		t.Fatalf("December = %q", got)
	}
	if got := AccountTimelineMonthDocumentID("acct", 1, 2026, 1, false); got != "acct|1|2026-01" {
		t.Fatalf("January = %q, want a padded month", got)
	}
	if AccountTimelineMonthDocumentID("acct", 1, 2026, 1, false) >= AccountTimelineMonthDocumentID("acct", 1, 2026, 2, false) {
		t.Fatal("padded ids must sort in calendar order")
	}
}

func TestClearQueuedAccountsSkipsBlankIDs(t *testing.T) {
	t.Parallel()
	m := testMongo(t)

	deleted, err := m.ClearQueuedAccounts(t.Context(), []QueuedAccount{{AccountID: "", Claim: 3}})
	if err != nil {
		t.Fatalf("ClearQueuedAccounts: %v", err)
	}
	if deleted != 0 {
		t.Fatalf("deleted = %d, want 0", deleted)
	}
}

// The queue's whole purpose is that a change arriving while a rebuild is in
// flight is not swallowed by that rebuild's clear. These pin the documents that
// implement it, without needing a server.

func TestQueueAccountRebuildPreservesQueuedAtAndBumpsClaim(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 8, 22, 10, 0, 0, 0, time.UTC)

	update := queueAccountRebuildUpdate(now)

	// queuedAt is set only on insert, so a re-queue leaves the original wait time
	// alone rather than making a long-outstanding account look fresh.
	insert, ok := update["$setOnInsert"].(bson.M)
	if !ok {
		t.Fatalf("$setOnInsert = %T, want bson.M", update["$setOnInsert"])
	}
	if insert["queuedAt"] != now {
		t.Fatalf("queuedAt = %v, want %v", insert["queuedAt"], now)
	}
	if _, bumped := insert["claim"]; bumped {
		t.Fatal("claim must not be in $setOnInsert, or a re-queue would not invalidate an in-flight rebuild")
	}

	// claim increments on every request, including the first.
	inc, ok := update["$inc"].(bson.M)
	if !ok {
		t.Fatalf("$inc = %T, want bson.M", update["$inc"])
	}
	if inc["claim"] != 1 {
		t.Fatalf("$inc claim = %v, want 1", inc["claim"])
	}
	if _, wrong := update["$set"]; wrong {
		t.Fatal("$set would overwrite queuedAt on every request")
	}
}

func TestClearQueuedAccountFilterIsClaimScoped(t *testing.T) {
	t.Parallel()

	filter := clearQueuedAccountFilter(QueuedAccount{AccountID: "acct-1", Claim: 7})

	if filter["_id"] != "acct-1" {
		t.Fatalf("_id = %v", filter["_id"])
	}
	claim, present := filter["claim"]
	if !present {
		t.Fatal("filter has no claim — an account re-queued mid-rebuild would be deleted anyway")
	}
	if claim != int64(7) {
		t.Fatalf("claim = %v, want the claim the rebuild read", claim)
	}
}

// A rebuild that read claim 3 must not clear an account now on claim 4.
func TestClearFilterDoesNotMatchARequeuedAccount(t *testing.T) {
	t.Parallel()

	read := clearQueuedAccountFilter(QueuedAccount{AccountID: "acct-1", Claim: 3})
	requeued := bson.M{"_id": "acct-1", "claim": int64(4)}

	if read["claim"] == requeued["claim"] {
		t.Fatal("a stale claim must not equal the current one")
	}
}
