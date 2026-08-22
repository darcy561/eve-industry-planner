package mongo

import (
	"testing"
	"time"
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
		{"UserRollupBuckets", m.UserRollupBuckets, CollectionUserRollupBuckets},
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

	if got := BuildStatsDocumentID("acct", 1234); got != "acct|1234" {
		t.Fatalf("BuildStatsDocumentID = %q", got)
	}
	if got := ArchivedJobStatsDocumentID("acct", "job-1"); got != "acct|job-1" {
		t.Fatalf("ArchivedJobStatsDocumentID = %q", got)
	}
	if got := UserRollupMonthlyDocumentID("acct", 1234, 2026, 8); got != "acct|1234|2026-08" {
		t.Fatalf("UserRollupMonthlyDocumentID = %q, want acct|1234|2026-08", got)
	}
}

// The month segment is zero padded so _id ordering matches calendar ordering.
func TestUserRollupMonthlyDocumentIDPadsMonth(t *testing.T) {
	t.Parallel()

	if got := UserRollupMonthlyDocumentID("acct", 1, 2026, 12); got != "acct|1|2026-12" {
		t.Fatalf("December = %q", got)
	}
	if got := UserRollupMonthlyDocumentID("acct", 1, 2026, 1); got != "acct|1|2026-01" {
		t.Fatalf("January = %q, want a padded month", got)
	}
	if UserRollupMonthlyDocumentID("acct", 1, 2026, 1) >= UserRollupMonthlyDocumentID("acct", 1, 2026, 2) {
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
