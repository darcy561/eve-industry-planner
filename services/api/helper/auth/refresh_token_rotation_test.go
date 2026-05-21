package auth

import (
	"context"
	"testing"
	"time"
)

func TestResolvePresentedRefreshToken_RecoversFromSession(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	rdb, _ := newAuthTestRedis(t)

	const (
		accountID   = "acct-presented-resolve"
		sessionID   = "sess-presented-resolve"
		staleToken  = "00000000-0000-4000-8000-000000000099"
		currentToken = "33333333-3333-4333-8333-333333333333"
	)
	now := time.Now().UTC()
	rec := &AccountSessionsRecord{
		AccountID: accountID,
		Sessions: map[string]AccountSession{
			sessionID: {
				SessionID:        sessionID,
				CharacterHash:    "hash3",
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
		CharacterHash: "hash3",
		SessionID:     sessionID,
		SessionStart:  now,
		SessionSeenAt: now,
	}
	if err := StoreRefreshToken(ctx, rdb, currentToken, data); err != nil {
		t.Fatalf("StoreRefreshToken: %v", err)
	}

	got, err := ResolvePresentedRefreshToken(ctx, rdb, staleToken, sessionID)
	if err != nil {
		t.Fatalf("ResolvePresentedRefreshToken: %v", err)
	}
	if !got.RecoveredViaSession {
		t.Fatal("expected RecoveredViaSession")
	}
	if got.Token != currentToken {
		t.Fatalf("token = %q, want %q", got.Token, currentToken)
	}
	if got.Data == nil || got.Data.AccountID != accountID {
		t.Fatalf("unexpected data: %+v", got.Data)
	}
}

func TestMintAndStoreRefreshToken(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	rdb, _ := newAuthTestRedis(t)

	const sessionID = "sess-mint-store"
	now := time.Now().UTC()
	data := RefreshTokenData{
		AccountID:     "acct-mint",
		CharacterHash: "hash-mint",
		SessionID:     sessionID,
		SessionStart:  now,
		SessionSeenAt: now,
	}
	token, err := MintAndStoreRefreshToken(ctx, rdb, data)
	if err != nil {
		t.Fatalf("MintAndStoreRefreshToken: %v", err)
	}
	if token == "" {
		t.Fatal("expected non-empty token")
	}
	loaded, err := GetRefreshTokenData(ctx, rdb, token)
	if err != nil {
		t.Fatalf("GetRefreshTokenData: %v", err)
	}
	if loaded.SessionID != sessionID {
		t.Fatalf("SessionID = %q, want %q", loaded.SessionID, sessionID)
	}
}

func TestUseAppRefreshCookieOnResponse(t *testing.T) {
	t.Parallel()
	if UseAppRefreshCookieOnResponse(true, false) != true {
		t.Fatal("expected true for refreshFromCookie")
	}
	if UseAppRefreshCookieOnResponse(false, true) != true {
		t.Fatal("expected true for recoveredViaSession")
	}
	if UseAppRefreshCookieOnResponse(false, false) {
		t.Fatal("expected false")
	}
}

