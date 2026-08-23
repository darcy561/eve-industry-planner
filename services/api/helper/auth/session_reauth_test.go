package auth

import (
	"context"
	"testing"
	"time"

	"eve-industry-planner/testing/redisfake"
)

func TestReauthDeadlineFromSessionStart(t *testing.T) {
	start := time.Date(2026, 5, 13, 10, 50, 19, 0, time.UTC)
	deadline := ReauthDeadlineFromSessionStart(start)
	want := start.Add(RefreshTokenTTL)
	if !deadline.Equal(want) {
		t.Fatalf("deadline = %v, want %v", deadline, want)
	}
	if !ReauthDeadlineFromSessionStart(time.Time{}).IsZero() {
		t.Fatal("zero session start should yield zero deadline")
	}
}

func TestReauthDeadline_StrictestWhenDivergent(t *testing.T) {
	start := time.Date(2026, 5, 13, 10, 50, 19, 0, time.UTC)
	fromStart := ReauthDeadlineFromSessionStart(start)
	later := fromStart.Add(24 * time.Hour)
	earlier := fromStart.Add(-time.Hour)

	if !ReauthDeadline(start, later).Equal(fromStart) {
		t.Fatal("expected later persisted reauth to be ignored in favor of start+TTL")
	}
	if !ReauthDeadline(start, earlier).Equal(earlier) {
		t.Fatal("expected earlier persisted reauth to win")
	}
}

func TestReauthDeadline_AlignsSessionStartAndPersisted(t *testing.T) {
	start := time.Date(2026, 5, 13, 10, 50, 19, 0, time.UTC)
	normal := ReauthDeadlineFromSessionStart(start)
	if !ReauthDeadline(start, normal).Equal(normal) {
		t.Fatal("aligned start and reauth_required_at should match single deadline")
	}
}

func TestIsPlannerSessionReauthExpired(t *testing.T) {
	start := time.Date(2026, 5, 13, 10, 50, 19, 0, time.UTC)
	deadline := ReauthDeadlineFromSessionStart(start)

	if IsPlannerSessionReauthExpired(start, deadline.Add(-time.Second)) {
		t.Fatal("expected not expired before deadline")
	}
	if IsPlannerSessionReauthExpired(start, deadline) {
		t.Fatal("expected not expired exactly at deadline (After, not >=)")
	}
	if !IsPlannerSessionReauthExpired(start, deadline.Add(time.Hour)) {
		t.Fatal("expected expired after deadline")
	}
	if IsPlannerSessionReauthExpired(time.Time{}, time.Now().UTC()) {
		t.Fatal("zero session start should not be treated as expired")
	}
}

func TestIsReauthExpired_MatchesMiddlewareAndRefreshTokenPaths(t *testing.T) {
	start := time.Date(2026, 5, 13, 10, 50, 19, 0, time.UTC)
	reauthAt := ReauthDeadlineFromSessionStart(start)
	after := reauthAt.Add(time.Minute)

	if IsReauthExpired(start, reauthAt, after) != IsPlannerSessionReauthExpired(start, after) {
		t.Fatal("account session and refresh-token paths should agree when reauth_required_at is canonical")
	}
}

func TestIsRefreshTokenDataReauthExpired_AccountSessionStricter(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	rdb := redisfake.New(t).Client

	const (
		accountID = "acct-reauth-align"
		sessionID = "sess-reauth-align"
	)
	now := time.Now().UTC()
	accountStarted := now.Add(-10 * 24 * time.Hour)
	accountReauth := now.Add(-time.Hour)
	// Token row says not expired; account_sessions row is past reauth (divergent legacy shape).
	token := &RefreshTokenData{
		AccountID:    accountID,
		SessionID:    sessionID,
		SessionStart: now.Add(-24 * time.Hour),
	}
	if err := UpsertAccountSession(ctx, rdb, accountID, AccountSession{
		SessionID:        sessionID,
		CharacterHash:    "hash",
		StartedAt:        accountStarted,
		LastSeenAt:       accountStarted,
		ReauthRequiredAt: accountReauth,
	}); err != nil {
		t.Fatalf("UpsertAccountSession: %v", err)
	}
	if !IsRefreshTokenDataReauthExpired(ctx, rdb, token, now) {
		t.Fatal("expected expired when account_sessions row is past reauth even if token SessionStart is recent")
	}
}

func TestUpsertSessionRecord_ReauthMatchesSessionStart(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	rdb := redisfake.New(t).Client

	const (
		accountID = "acct-upsert-reauth"
		sessionID = "sess-upsert-reauth"
	)
	start := time.Now().UTC().Add(-time.Hour)
	if err := UpsertSessionRecord(ctx, rdb, SessionRecord{
		SessionID:     sessionID,
		AccountID:     accountID,
		CharacterHash: "hash",
		StartedAt:     start,
		LastSeenAt:    start,
	}); err != nil {
		t.Fatalf("UpsertSessionRecord: %v", err)
	}
	_, sess, err := ResolveAccountSessionBySessionID(ctx, rdb, sessionID)
	if err != nil {
		t.Fatalf("ResolveAccountSessionBySessionID: %v", err)
	}
	want := ReauthDeadlineFromSessionStart(start)
	if !sess.ReauthRequiredAt.Equal(want) {
		t.Fatalf("ReauthRequiredAt = %v, want %v", sess.ReauthRequiredAt, want)
	}
	if ReauthRequiredAtUnix(start, time.Time{}) != want.Unix() {
		t.Fatal("API unix deadline should match stored session row")
	}
}
