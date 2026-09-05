package mongo

import (
	"testing"
	"time"

	"eve-industry-planner/shared/models"

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
		{"ArchivedJobStats", m.StatisticsRows, CollectionStatisticsRows},
		{"AccountTimelineMonths", m.StatisticsTimeline, CollectionStatisticsTimeline},
		{"AccountRebuildQueue", m.StatisticsRebuildQueue, CollectionStatisticsRebuildQueue},
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

func TestRebuildQueueRequiresHandleAndOwner(t *testing.T) {
	t.Parallel()
	var nilMongo *Mongo
	owner := models.AccountOwner("acct")

	if err := nilMongo.QueueOwnerWork(t.Context(), owner, StatsWorkRebuild, time.Time{}); err == nil {
		t.Fatal("expected an error without a mongo handle")
	}
	if _, err := nilMongo.ListQueuedOwners(t.Context(), time.Time{}); err == nil {
		t.Fatal("expected an error without a mongo handle")
	}
	if _, err := nilMongo.ClearQueuedOwner(t.Context(), QueuedOwner{Owner: owner}); err == nil {
		t.Fatal("expected an error without a mongo handle")
	}
	if _, err := nilMongo.OwnerClaimIsCurrent(t.Context(), QueuedOwner{Owner: owner}); err == nil {
		t.Fatal("expected an error without a mongo handle")
	}

	m := testMongo(t)
	if err := m.QueueOwnerWork(t.Context(), models.AccountOwner(""), StatsWorkRebuild, time.Time{}); err == nil {
		t.Fatal("expected an error for an empty accountID")
	}
	if err := m.QueueOwnerWork(t.Context(), models.Owner{Kind: "character", ID: "x"}, StatsWorkRebuild, time.Time{}); err == nil {
		t.Fatal("expected an error for an owner kind nothing can read back")
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
	if _, err := m.StatisticsRows.DistinctStrings(t.Context(), "", nil); err == nil {
		t.Fatal("expected an error for an empty field name")
	}
}

func TestStatisticsDocumentIDs(t *testing.T) {
	t.Parallel()

	if got := ProductionTotalsDocumentID(models.AccountOwner("acct"), 1234); got != "account:acct|1234" {
		t.Fatalf("ProductionTotalsDocumentID = %q", got)
	}
	if got := ArchivedJobStatsDocumentID(models.AccountOwner("acct"), "job-1"); got != "account:acct|job-1" {
		t.Fatalf("ArchivedJobStatsDocumentID = %q", got)
	}
	if got := TimelineMonthDocumentID(models.AccountOwner("acct"), 1234, 2026, 8, false); got != "account:acct|1234|2026-08" {
		t.Fatalf("TimelineMonthDocumentID = %q, want account:acct|1234|2026-08", got)
	}
}

// The month segment is zero padded so _id ordering matches calendar ordering.
func TestAccountTimelineMonthDocumentIDPadsMonth(t *testing.T) {
	t.Parallel()

	if got := TimelineMonthDocumentID(models.AccountOwner("acct"), 1, 2026, 12, false); got != "account:acct|1|2026-12" {
		t.Fatalf("December = %q", got)
	}
	if got := TimelineMonthDocumentID(models.AccountOwner("acct"), 1, 2026, 1, false); got != "account:acct|1|2026-01" {
		t.Fatalf("January = %q, want a padded month", got)
	}
	if TimelineMonthDocumentID(models.AccountOwner("acct"), 1, 2026, 1, false) >= TimelineMonthDocumentID(models.AccountOwner("acct"), 1, 2026, 2, false) {
		t.Fatal("padded ids must sort in calendar order")
	}
}

// The queue's whole purpose is that a change arriving while a rebuild is in
// flight is not swallowed by that rebuild's clear. These pin the documents that
// implement it, without needing a server.

func TestQueueOwnerWorkUpdatePreservesQueuedAtAndBumpsClaim(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 8, 22, 10, 0, 0, 0, time.UTC)

	update := queueOwnerWorkUpdate(StatsWorkRebuild, now)

	// queuedAt is set only on insert, so a re-queue leaves the original wait time
	// alone rather than making a long-outstanding account look fresh.
	insert, ok := update["$setOnInsert"].(bson.M)
	if !ok {
		t.Fatalf("$setOnInsert = %T, want bson.M", update["$setOnInsert"])
	}
	if insert["queuedAt"] != now.UTC() {
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

func TestClearQueuedOwnerFilterIsClaimScoped(t *testing.T) {
	t.Parallel()

	filter := clearQueuedOwnerFilter(QueuedOwner{Owner: models.AccountOwner("acct-1"), Claim: 7})

	if filter["_id"] != "account:acct-1" {
		t.Fatalf("_id = %v, want the owner key", filter["_id"])
	}
	claim, present := filter["claim"]
	if !present {
		t.Fatal("filter has no claim — an owner re-queued mid-rebuild would be deleted anyway")
	}
	if claim != int64(7) {
		t.Fatalf("claim = %v, want the claim the rebuild read", claim)
	}
}

func TestQueuedOwnerFilterUsesTheOwnerKey(t *testing.T) {
	t.Parallel()

	if got := queuedOwnerFilter(models.AccountOwner("acct-1"))["_id"]; got != "account:acct-1" {
		t.Fatalf("_id = %v, want the owner key", got)
	}
	corp := models.Owner{Kind: models.OwnerCorporation, ID: "acct-1"}
	if got := queuedOwnerFilter(corp)["_id"]; got == "account:acct-1" {
		t.Fatal("two kinds sharing an id must not collide on one queue entry")
	}
}
