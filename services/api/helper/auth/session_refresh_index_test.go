package auth

import (
	"context"
	"errors"
	"testing"
	"time"

	rediscore "eve-industry-planner/shared/core/redis"
)

func TestSessionRefreshIndex_StoreRevokeResolve(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	rdb, _ := newAuthTestRedis(t)

	const (
		accountID = "acct-sess-refresh-idx"
		sessionID = "sess-refresh-idx-1"
		token     = "11111111-1111-4111-8111-111111111111"
	)
	now := time.Now().UTC()
	rec := &AccountSessionsRecord{
		AccountID: accountID,
		Sessions: map[string]AccountSession{
			sessionID: {
				SessionID:        sessionID,
				CharacterHash:    "hash1",
				StartedAt:        now,
				LastSeenAt:       now,
				ReauthRequiredAt: ReauthDeadlineFromSessionStart(now),
			},
		},
	}
	if err := SaveAccountSessionsRecord(ctx, rdb, rec); err != nil {
		t.Fatalf("SaveAccountSessionsRecord: %v", err)
	}
	if err := rdb.Set(ctx, sessionIndexKey(sessionID), accountID, SessionTTL).Err(); err != nil {
		t.Fatalf("set session index: %v", err)
	}

	data := RefreshTokenData{
		AccountID:     accountID,
		CharacterHash: "hash1",
		SessionID:     sessionID,
		SessionStart:  now,
		SessionSeenAt: now,
	}
	if err := StoreRefreshToken(ctx, rdb, token, data); err != nil {
		t.Fatalf("StoreRefreshToken: %v", err)
	}

	got, resolved, err := ResolveRefreshTokenForValidSession(ctx, rdb, sessionID)
	if err != nil {
		t.Fatalf("ResolveRefreshTokenForValidSession: %v", err)
	}
	if got != token {
		t.Fatalf("token = %q, want %q", got, token)
	}
	if resolved == nil || resolved.AccountID != accountID {
		t.Fatalf("unexpected resolved data: %+v", resolved)
	}

	if err := RevokeRefreshToken(ctx, rdb, token); err != nil {
		t.Fatalf("RevokeRefreshToken: %v", err)
	}
	exists, err := rdb.Exists(ctx, sessionRefreshIndexKey(sessionID)).Result()
	if err != nil {
		t.Fatalf("Exists index: %v", err)
	}
	if exists != 0 {
		t.Fatal("expected session_refresh index removed after revoke")
	}
	_, _, err = ResolveRefreshTokenForValidSession(ctx, rdb, sessionID)
	if !errors.Is(err, ErrRefreshTokenNotFound) {
		t.Fatalf("expected ErrRefreshTokenNotFound after revoke, got %v", err)
	}
}

func TestResolveRefreshTokenForValidSession_ScanFallback(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	rdb, _ := newAuthTestRedis(t)

	const (
		accountID = "acct-scan-fallback"
		sessionID = "sess-scan-fallback"
		token     = "22222222-2222-4222-8222-222222222222"
	)
	now := time.Now().UTC()
	rec := &AccountSessionsRecord{
		AccountID: accountID,
		Sessions: map[string]AccountSession{
			sessionID: {
				SessionID:        sessionID,
				CharacterHash:    "hash2",
				StartedAt:        now,
				LastSeenAt:       now,
				ReauthRequiredAt: ReauthDeadlineFromSessionStart(now),
			},
		},
	}
	if err := SaveAccountSessionsRecord(ctx, rdb, rec); err != nil {
		t.Fatalf("SaveAccountSessionsRecord: %v", err)
	}
	if err := rdb.Set(ctx, sessionIndexKey(sessionID), accountID, SessionTTL).Err(); err != nil {
		t.Fatalf("set session index: %v", err)
	}

	// Legacy row without session_refresh index (direct JSON write).
	data := RefreshTokenData{
		AccountID:     accountID,
		CharacterHash: "hash2",
		SessionID:     sessionID,
		SessionStart:  now,
		SessionSeenAt: now,
	}
	if err := rediscore.SaveJSON(ctx, rdb, RefreshTokenKeyPrefix+token, data, RefreshTokenTTL); err != nil {
		t.Fatalf("save refresh json: %v", err)
	}

	got, _, err := ResolveRefreshTokenForValidSession(ctx, rdb, sessionID)
	if err != nil {
		t.Fatalf("ResolveRefreshTokenForValidSession: %v", err)
	}
	if got != token {
		t.Fatalf("token = %q, want %q", got, token)
	}
	exists, err := rdb.Exists(ctx, sessionRefreshIndexKey(sessionID)).Result()
	if err != nil {
		t.Fatalf("Exists index: %v", err)
	}
	if exists == 0 {
		t.Fatal("expected scan fallback to backfill session_refresh index")
	}
}
