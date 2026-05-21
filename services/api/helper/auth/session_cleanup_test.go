package auth

import (
	"context"
	"testing"
	"time"
)

func TestCleanupOrphanSessionIndexes(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	rdb, _ := newAuthTestRedis(t)

	const accountID = "acct-orphan-cleanup"
	if err := SaveAccountSessionsRecord(ctx, rdb, &AccountSessionsRecord{
		AccountID: accountID,
		Grants: SessionGrants{
			CorporationIDs: []int64{},
			AllianceIDs:    []int64{},
		},
		Sessions: map[string]AccountSession{},
	}); err != nil {
		t.Fatalf("save: %v", err)
	}
	if err := rdb.Set(ctx, sessionIndexKey("orphan-idx-1"), accountID, SessionTTL).Err(); err != nil {
		t.Fatalf("set index: %v", err)
	}

	found, err := CleanupOrphanSessionIndexes(ctx, rdb, SessionCleanupOptions{DryRun: true})
	if err != nil {
		t.Fatalf("dry-run: %v", err)
	}
	if found != 1 {
		t.Fatalf("dry-run found = %d, want 1", found)
	}
	exists, _ := rdb.Exists(ctx, sessionIndexKey("orphan-idx-1")).Result()
	if exists != 1 {
		t.Fatal("dry-run should not delete index")
	}

	removed, err := CleanupOrphanSessionIndexes(ctx, rdb, SessionCleanupOptions{})
	if err != nil {
		t.Fatalf("cleanup: %v", err)
	}
	if removed != 1 {
		t.Fatalf("removed = %d, want 1", removed)
	}
	exists, _ = rdb.Exists(ctx, sessionIndexKey("orphan-idx-1")).Result()
	if exists != 0 {
		t.Fatal("expected orphan index deleted")
	}
}

func TestCleanupOrphanRefreshTokens(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	rdb, _ := newAuthTestRedis(t)

	const (
		accountID = "acct-orphan-refresh"
		token     = "refresh-orphan-token"
		sessionID = "sess-still-valid"
	)
	now := time.Now().UTC()
	if err := UpsertAccountSession(ctx, rdb, accountID, AccountSession{
		SessionID:        sessionID,
		CharacterHash:    "hash",
		StartedAt:        now,
		LastSeenAt:       now,
		ReauthRequiredAt: ReauthDeadlineFromSessionStart(now),
	}); err != nil {
		t.Fatalf("upsert session: %v", err)
	}

	orphanData := RefreshTokenData{
		AccountID:     accountID,
		CharacterHash: "hash",
		SessionID:     "missing-from-map",
		SessionStart:  now,
		SessionSeenAt: now,
	}
	if err := StoreRefreshToken(ctx, rdb, token, orphanData); err != nil {
		t.Fatalf("store refresh: %v", err)
	}

	found, err := CleanupOrphanRefreshTokens(ctx, rdb, SessionCleanupOptions{})
	if err != nil {
		t.Fatalf("cleanup: %v", err)
	}
	if found != 1 {
		t.Fatalf("found = %d, want 1", found)
	}
	if _, err := GetRefreshTokenData(ctx, rdb, token); err == nil {
		t.Fatal("expected orphan refresh_token removed")
	}
}

func TestRunAuthSessionMaintenance_Integrated(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	rdb, _ := newAuthTestRedis(t)

	const accountID = "acct-maint-integrated"
	if err := rdb.Set(ctx, sessionIndexKey("idx-maint"), accountID, SessionTTL).Err(); err != nil {
		t.Fatalf("index: %v", err)
	}
	if err := StoreRefreshToken(ctx, rdb, "tok-maint", RefreshTokenData{
		AccountID:     accountID,
		CharacterHash: "h",
		SessionID:     "sess-not-there",
		SessionStart:  time.Now().UTC(),
	}); err != nil {
		t.Fatalf("refresh: %v", err)
	}

	stats, err := RunAuthSessionMaintenance(ctx, rdb, SessionCleanupOptions{})
	if err != nil {
		t.Fatalf("maintenance: %v", err)
	}
	if stats.OrphanSessionIndexesRemoved < 1 {
		t.Fatalf("indexes removed = %d, want >= 1", stats.OrphanSessionIndexesRemoved)
	}
	if stats.OrphanRefreshTokensRemoved < 1 {
		t.Fatalf("refresh removed = %d, want >= 1", stats.OrphanRefreshTokensRemoved)
	}
}
