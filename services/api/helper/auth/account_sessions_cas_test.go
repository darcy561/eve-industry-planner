package auth

import (
	"context"
	"sync"
	"testing"
	"time"
)

func TestSaveAccountSessionsRecord_CASRejectsStaleWrite(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	rdb, _ := newAuthTestRedis(t)

	const accountID = "acct-cas-stale"
	now := time.Now().UTC()
	if err := UpsertAccountSession(ctx, rdb, accountID, AccountSession{
		SessionID:        "s1",
		CharacterHash:    "hash",
		StartedAt:        now,
		LastSeenAt:       now,
		ReauthRequiredAt: ReauthDeadlineFromSessionStart(now),
	}); err != nil {
		t.Fatalf("initial upsert: %v", err)
	}

	loaded, exists, err := loadAccountSessionsRecordRaw(ctx, rdb, accountID)
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	staleCAS := accountSessionsCASFromRecord(loaded, exists)

	if err := UpdateAccountSessionGrants(ctx, rdb, accountID, []int64{1}, nil); err != nil {
		t.Fatalf("grants bump: %v", err)
	}

	staleRec := *loaded
	staleRec.Sessions = map[string]AccountSession{}
	err = saveAccountSessionsRecordCAS(ctx, rdb, &staleRec, staleCAS)
	if err == nil {
		t.Fatal("expected stale save to fail")
	}
	if err != ErrAccountSessionsConflict {
		t.Fatalf("expected ErrAccountSessionsConflict, got %v", err)
	}

	reloaded, err := GetAccountSessionsRecord(ctx, rdb, accountID)
	if err != nil {
		t.Fatalf("reload: %v", err)
	}
	if _, ok := reloaded.Sessions["s1"]; !ok {
		t.Fatal("expected stale write not to remove session row")
	}
	if len(reloaded.Grants.CorporationIDs) != 1 || reloaded.Grants.CorporationIDs[0] != 1 {
		t.Fatalf("grants = %v, want [1]", reloaded.Grants.CorporationIDs)
	}
}

// TestConcurrentGrantsUpdatesAreNotLost drives many overlapping grant updates and asserts every
// one is reflected in the stored record. A write that escapes MULTI/EXEC leaves the WATCH
// unenforced, so a racing writer is silently overwritten and the version stalls below the count.
func TestConcurrentGrantsUpdatesAreNotLost(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	rdb, _ := newAuthTestRedis(t)

	const (
		accountID = "acct-cas-lost-update"
		rounds    = 40
	)
	now := time.Now().UTC()
	if err := UpsertAccountSession(ctx, rdb, accountID, AccountSession{
		SessionID:        "s1",
		CharacterHash:    "hash",
		StartedAt:        now,
		LastSeenAt:       now,
		ReauthRequiredAt: ReauthDeadlineFromSessionStart(now),
	}); err != nil {
		t.Fatalf("initial upsert: %v", err)
	}

	// Release both writers of each pair together so their read-compare-write windows overlap.
	for range rounds {
		start := make(chan struct{})
		var wg sync.WaitGroup
		wg.Add(2)
		errCh := make(chan error, 2)

		for _, corp := range []int64{1, 2} {
			go func() {
				defer wg.Done()
				<-start
				errCh <- UpdateAccountSessionGrants(ctx, rdb, accountID, []int64{corp}, nil)
			}()
		}

		close(start)
		wg.Wait()
		close(errCh)
		for err := range errCh {
			if err != nil {
				t.Fatalf("concurrent grants update failed: %v", err)
			}
		}
	}

	rec, err := GetAccountSessionsRecord(ctx, rdb, accountID)
	if err != nil {
		t.Fatalf("GetAccountSessionsRecord: %v", err)
	}
	// Every successful update bumps the version, so a lower count means a write was lost.
	if rec.GrantsVersion < rounds*2 {
		t.Fatalf("grants version = %d, want at least %d; updates were lost", rec.GrantsVersion, rounds*2)
	}
}

func TestConcurrentUpsertAndGrantsPreservesSession(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	rdb, _ := newAuthTestRedis(t)

	const (
		accountID = "acct-cas-concurrent"
		sessionID = "sess-cas-concurrent"
	)
	now := time.Now().UTC()
	session := AccountSession{
		SessionID:        sessionID,
		CharacterHash:    "main-hash",
		StartedAt:        now,
		LastSeenAt:       now,
		ReauthRequiredAt: ReauthDeadlineFromSessionStart(now),
	}

	var wg sync.WaitGroup
	wg.Add(2)
	errCh := make(chan error, 2)

	go func() {
		defer wg.Done()
		errCh <- UpsertAccountSession(ctx, rdb, accountID, session)
	}()
	go func() {
		defer wg.Done()
		time.Sleep(2 * time.Millisecond)
		errCh <- UpdateAccountSessionGrants(ctx, rdb, accountID, []int64{100}, []int64{200})
	}()

	wg.Wait()
	close(errCh)
	for err := range errCh {
		if err != nil {
			t.Fatalf("concurrent mutation failed: %v", err)
		}
	}

	rec, err := GetAccountSessionsRecord(ctx, rdb, accountID)
	if err != nil {
		t.Fatalf("GetAccountSessionsRecord: %v", err)
	}
	sess, ok := rec.Sessions[sessionID]
	if !ok {
		t.Fatal("expected session row after concurrent upsert + grants")
	}
	if sess.CharacterHash != "main-hash" {
		t.Fatalf("session hash = %q, want main-hash", sess.CharacterHash)
	}
	if len(rec.Grants.CorporationIDs) != 1 || rec.Grants.CorporationIDs[0] != 100 {
		t.Fatalf("grants corps = %v, want [100]", rec.Grants.CorporationIDs)
	}
	if len(rec.Grants.AllianceIDs) != 1 || rec.Grants.AllianceIDs[0] != 200 {
		t.Fatalf("grants alliances = %v, want [200]", rec.Grants.AllianceIDs)
	}
	if sess.Grants.CorporationIDs[0] != 100 {
		t.Fatal("expected session-level grants to match account grants")
	}
}
