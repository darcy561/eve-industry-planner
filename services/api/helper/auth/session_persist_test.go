package auth

import (
	"context"
	"testing"
	"time"
)

func TestVerifyAccountSessionPersisted(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	rdb, _ := newAuthTestRedis(t)

	const (
		accountID = "acct-verify-persist"
		sessionID = "sess-verify-persist"
	)
	now := time.Now().UTC()
	if err := UpsertAccountSession(ctx, rdb, accountID, AccountSession{
		SessionID:        sessionID,
		CharacterHash:    "hash",
		StartedAt:        now,
		LastSeenAt:       now,
		ReauthRequiredAt: ReauthDeadlineFromSessionStart(now),
	}); err != nil {
		t.Fatalf("UpsertAccountSession: %v", err)
	}
	if err := VerifyAccountSessionPersisted(ctx, rdb, accountID, sessionID); err != nil {
		t.Fatalf("verify present session: %v", err)
	}

	if err := VerifyAccountSessionPersisted(ctx, rdb, accountID, "missing-session"); err == nil {
		t.Fatal("expected error for missing session")
	}

	// Simulate orphan refresh row: index + account record without session row.
	if err := rdb.Set(ctx, sessionIndexKey("orphan-sess"), accountID, SessionTTL).Err(); err != nil {
		t.Fatalf("set orphan index: %v", err)
	}
	if err := VerifyAccountSessionPersisted(ctx, rdb, accountID, "orphan-sess"); err == nil {
		t.Fatal("expected error when session_index exists but account_sessions row is missing")
	}
}

func TestUpsertFailureLeavesNoDurableSessionForVerify(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	rdb, _ := newAuthTestRedis(t)

	const accountID = "acct-no-upsert"
	err := VerifyAccountSessionPersisted(ctx, rdb, accountID, "never-written")
	if err == nil {
		t.Fatal("expected verify error when session was never upserted")
	}
}

func TestRevokeRefreshTokensForLogout(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	rdb, _ := newAuthTestRedis(t)

	const (
		accountID = "acct-logout-revoke"
		sessionID = "sess-logout-revoke"
		stale     = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
		current   = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
	)
	now := time.Now().UTC()
	data := RefreshTokenData{
		AccountID:     accountID,
		CharacterHash: "hash",
		SessionID:     sessionID,
		SessionStart:  now,
		SessionSeenAt: now,
	}
	if err := StoreRefreshToken(ctx, rdb, stale, data); err != nil {
		t.Fatalf("StoreRefreshToken stale: %v", err)
	}
	if err := StoreRefreshToken(ctx, rdb, current, data); err != nil {
		t.Fatalf("StoreRefreshToken current: %v", err)
	}
	if err := setSessionRefreshIndex(ctx, rdb, data, current); err != nil {
		t.Fatalf("setSessionRefreshIndex: %v", err)
	}

	if err := RevokeRefreshTokensForLogout(ctx, rdb, stale, sessionID); err != nil {
		t.Fatalf("RevokeRefreshTokensForLogout: %v", err)
	}
	for _, tok := range []string{stale, current} {
		if _, err := GetRefreshTokenData(ctx, rdb, tok); err != ErrRefreshTokenNotFound {
			t.Fatalf("token %q should be revoked, got err=%v", tok, err)
		}
	}
	exists, err := rdb.Exists(ctx, sessionRefreshIndexKey(sessionID)).Result()
	if err != nil {
		t.Fatalf("Exists index: %v", err)
	}
	if exists != 0 {
		t.Fatal("expected session_refresh index removed after logout revoke")
	}
}
