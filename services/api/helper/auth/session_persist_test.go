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
