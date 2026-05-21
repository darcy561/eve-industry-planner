package auth

import (
	"context"
	"net/http"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
)

func newSessionCookieRequest(sessionID string) *http.Request {
	r, _ := http.NewRequest(http.MethodGet, "/", nil)
	r.AddCookie(&http.Cookie{Name: AppSessionCookieName, Value: sessionID})
	return r
}

func newAuthTestRedis(t *testing.T) (*redis.Client, *miniredis.Miniredis) {
	t.Helper()
	srv, err := miniredis.Run()
	if err != nil {
		t.Fatalf("miniredis.Run: %v", err)
	}
	t.Cleanup(func() { srv.Close() })
	rdb := redis.NewClient(&redis.Options{Addr: srv.Addr()})
	t.Cleanup(func() { _ = rdb.Close() })
	return rdb, srv
}

func TestGetAccountSessionsRecord_PruneDeletesSessionIndex(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	rdb, _ := newAuthTestRedis(t)

	const (
		accountID = "acct-prune-index"
		sessionID = "sess-expired-1"
	)
	expiredAt := time.Now().UTC().Add(-time.Hour)
	rec := &AccountSessionsRecord{
		AccountID: accountID,
		Grants: SessionGrants{
			CorporationIDs: []int64{},
			AllianceIDs:    []int64{},
		},
		Sessions: map[string]AccountSession{
			sessionID: {
				SessionID:        sessionID,
				CharacterHash:    "hash",
				StartedAt:        expiredAt.Add(-8 * 24 * time.Hour),
				LastSeenAt:       expiredAt.Add(-8 * 24 * time.Hour),
				ReauthRequiredAt: expiredAt,
			},
		},
	}
	if err := SaveAccountSessionsRecord(ctx, rdb, rec); err != nil {
		t.Fatalf("SaveAccountSessionsRecord: %v", err)
	}
	if err := rdb.Set(ctx, sessionIndexKey(sessionID), accountID, SessionTTL).Err(); err != nil {
		t.Fatalf("set session index: %v", err)
	}

	got, err := GetAccountSessionsRecord(ctx, rdb, accountID)
	if err != nil {
		t.Fatalf("GetAccountSessionsRecord: %v", err)
	}
	if len(got.Sessions) != 0 {
		t.Fatalf("expected pruned sessions map empty, got %d", len(got.Sessions))
	}
	exists, err := rdb.Exists(ctx, sessionIndexKey(sessionID)).Result()
	if err != nil {
		t.Fatalf("Exists session index: %v", err)
	}
	if exists != 0 {
		t.Fatal("expected session_index deleted after prune")
	}
}

func TestResolveAccountSessionBySessionID_ClearsOrphanIndex(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	rdb, _ := newAuthTestRedis(t)

	const (
		accountID = "acct-orphan-index"
		sessionID = "sess-orphan-1"
	)
	rec := &AccountSessionsRecord{
		AccountID: accountID,
		Grants: SessionGrants{
			CorporationIDs: []int64{},
			AllianceIDs:    []int64{},
		},
		Sessions: map[string]AccountSession{},
	}
	if err := SaveAccountSessionsRecord(ctx, rdb, rec); err != nil {
		t.Fatalf("SaveAccountSessionsRecord: %v", err)
	}
	if err := rdb.Set(ctx, sessionIndexKey(sessionID), accountID, SessionTTL).Err(); err != nil {
		t.Fatalf("set session index: %v", err)
	}

	_, _, err := ResolveAccountSessionBySessionID(ctx, rdb, sessionID)
	if err == nil || err.Error() != "session not found" {
		t.Fatalf("expected session not found, got %v", err)
	}
	exists, err := rdb.Exists(ctx, sessionIndexKey(sessionID)).Result()
	if err != nil {
		t.Fatalf("Exists session index: %v", err)
	}
	if exists != 0 {
		t.Fatal("expected orphan session_index removed on resolve")
	}
}

func TestRevokeAccountSession_DeletesSessionIndex(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	rdb, _ := newAuthTestRedis(t)

	const (
		accountID = "acct-revoke-index"
		sessionID = "sess-revoke-1"
	)
	now := time.Now().UTC()
	if err := UpsertAccountSession(ctx, rdb, accountID, AccountSession{
		SessionID:        sessionID,
		CharacterHash:    "hash",
		StartedAt:        now,
		LastSeenAt:       now,
		ReauthRequiredAt: now.Add(RefreshTokenTTL),
	}); err != nil {
		t.Fatalf("UpsertAccountSession: %v", err)
	}

	if err := RevokeAccountSession(ctx, rdb, accountID, sessionID); err != nil {
		t.Fatalf("RevokeAccountSession: %v", err)
	}
	exists, err := rdb.Exists(ctx, sessionIndexKey(sessionID)).Result()
	if err != nil {
		t.Fatalf("Exists session index: %v", err)
	}
	if exists != 0 {
		t.Fatal("expected session_index deleted on revoke")
	}
}

func TestExtractAccountSession_OrphanIndexReturnsSessionMissing(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	rdb, _ := newAuthTestRedis(t)

	const (
		accountID = "acct-extract-orphan"
		sessionID = "sess-extract-orphan"
	)
	rec := &AccountSessionsRecord{
		AccountID: accountID,
		Grants: SessionGrants{
			CorporationIDs: []int64{},
			AllianceIDs:    []int64{},
		},
		Sessions: map[string]AccountSession{},
	}
	if err := SaveAccountSessionsRecord(ctx, rdb, rec); err != nil {
		t.Fatalf("SaveAccountSessionsRecord: %v", err)
	}
	if err := rdb.Set(ctx, sessionIndexKey(sessionID), accountID, SessionTTL).Err(); err != nil {
		t.Fatalf("set session index: %v", err)
	}

	req := newSessionCookieRequest(sessionID)
	_, err := ExtractAccountSession(ctx, req, rdb)
	if err == nil || err.Error() != "session_missing" {
		t.Fatalf("expected session_missing, got %v", err)
	}
	exists, err := rdb.Exists(ctx, sessionIndexKey(sessionID)).Result()
	if err != nil {
		t.Fatalf("Exists session index: %v", err)
	}
	if exists != 0 {
		t.Fatal("expected session_index cleared after ExtractAccountSession")
	}
}
