package plannersession

import (
	"context"
	"testing"
	"time"

	"eve-industry-planner/testing/redisfixture"
)

// seedSession writes one session for an account, with a refresh token pointing
// at it, the way a login leaves them.
func seedSession(t *testing.T, s *Store, accountID, sessionID, token string) {
	t.Helper()
	ctx := context.Background()
	if err := s.PutSession(ctx, accountID, Session{SessionID: sessionID}); err != nil {
		t.Fatalf("put session %s: %v", sessionID, err)
	}
	if err := s.PutRefreshToken(ctx, token, RefreshTokenData{
		AccountID: accountID,
		SessionID: sessionID,
	}); err != nil {
		t.Fatalf("put token %s: %v", token, err)
	}
}

func TestRevokeAllSessionsEndsEverySessionAnAccountHolds(t *testing.T) {
	ctx := context.Background()
	s := NewStore(redisfixture.New(t).Handle)

	seedSession(t, s, "acct", "sess-1", "tok-1")
	seedSession(t, s, "acct", "sess-2", "tok-2")

	report, err := s.RevokeAllSessions(ctx, "acct")
	if err != nil {
		t.Fatalf("revoke: %v", err)
	}
	if report.Sessions != 2 || report.Tokens != 2 {
		t.Fatalf("report = %+v, want 2 sessions and 2 tokens", report)
	}

	for _, sid := range []string{"sess-1", "sess-2"} {
		session, err := s.SessionRow(ctx, sid)
		if err != nil {
			t.Fatalf("%s should still resolve: %v", sid, err)
		}
		if session.RevokedAt == nil {
			t.Fatalf("%s should carry a tombstone", sid)
		}
	}
	for _, token := range []string{"tok-1", "tok-2"} {
		if _, found, err := s.RefreshToken(ctx, token); err != nil || found {
			t.Fatalf("%s should be gone: found=%v err=%v", token, found, err)
		}
	}
}

// The tombstone is only worth writing if a request can still find it. Removing
// the row instead would leave the id resolving to nothing, which is what an
// unknown session already does.
func TestRevokedSessionsStayResolvableSoTheyCanSayWhy(t *testing.T) {
	ctx := context.Background()
	s := NewStore(redisfixture.New(t).Handle)

	seedSession(t, s, "acct", "sess-1", "tok-1")
	if _, err := s.RevokeAllSessions(ctx, "acct"); err != nil {
		t.Fatalf("revoke: %v", err)
	}

	accountID, session, err := s.ResolveSession(ctx, "sess-1")
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if accountID != "acct" || session == nil || session.RevokedAt == nil {
		t.Fatalf("account=%q session=%+v, want a revoked session for acct", accountID, session)
	}
}

// A revoked session must not be able to rotate its way back in, whichever way
// the rotate reaches for its token.
func TestARevokedSessionCannotRotate(t *testing.T) {
	ctx := context.Background()
	s := NewStore(redisfixture.New(t).Handle)

	seedSession(t, s, "acct", "sess-1", "tok-1")
	if _, err := s.RevokeAllSessions(ctx, "acct"); err != nil {
		t.Fatalf("revoke: %v", err)
	}

	if _, _, err := s.ResolveTokenForValidSession(ctx, "sess-1"); err == nil {
		t.Fatal("a revoked session should not resolve a token")
	}
	if token, found, err := s.FindTokenForSession(ctx, "sess-1"); err != nil || found {
		t.Fatalf("no token should name the session: %q found=%v err=%v", token, found, err)
	}
}

func TestRevokeAllSessionsLeavesOtherAccountsAlone(t *testing.T) {
	ctx := context.Background()
	s := NewStore(redisfixture.New(t).Handle)

	seedSession(t, s, "acct", "sess-1", "tok-1")
	seedSession(t, s, "other", "sess-2", "tok-2")

	if _, err := s.RevokeAllSessions(ctx, "acct"); err != nil {
		t.Fatalf("revoke: %v", err)
	}

	session, err := s.SessionRow(ctx, "sess-2")
	if err != nil || session.RevokedAt != nil {
		t.Fatalf("the other account's session should be untouched: %+v err=%v", session, err)
	}
	if _, found, err := s.RefreshToken(ctx, "tok-2"); err != nil || !found {
		t.Fatalf("the other account's token should survive: found=%v err=%v", found, err)
	}
}

// A token whose row predates the account id being written onto it is still
// reachable by the session it names, and a revoke has to take it.
func TestRevokeAllSessionsTakesATokenKnownOnlyByItsSession(t *testing.T) {
	ctx := context.Background()
	s := NewStore(redisfixture.New(t).Handle)

	seedSession(t, s, "acct", "sess-1", "tok-1")
	if err := s.PutRefreshToken(ctx, "tok-orphan", RefreshTokenData{SessionID: "sess-1"}); err != nil {
		t.Fatalf("put orphan: %v", err)
	}

	if _, err := s.RevokeAllSessions(ctx, "acct"); err != nil {
		t.Fatalf("revoke: %v", err)
	}

	if _, found, err := s.RefreshToken(ctx, "tok-orphan"); err != nil || found {
		t.Fatalf("the orphan token should be gone: found=%v err=%v", found, err)
	}
}

// Revoking twice is a support action that may well be repeated; the second pass
// must not report work it did not do.
func TestRevokingTwiceCountsOnlyWhatItEnded(t *testing.T) {
	ctx := context.Background()
	s := NewStore(redisfixture.New(t).Handle)

	seedSession(t, s, "acct", "sess-1", "tok-1")
	if _, err := s.RevokeAllSessions(ctx, "acct"); err != nil {
		t.Fatalf("first revoke: %v", err)
	}

	report, err := s.RevokeAllSessions(ctx, "acct")
	if err != nil {
		t.Fatalf("second revoke: %v", err)
	}
	if report.Sessions != 0 || report.Tokens != 0 {
		t.Fatalf("report = %+v, want nothing left to end", report)
	}
}

// An account whose sessions have all aged out is not an error: the support
// request that prompts a revoke does not know what is live.
func TestRevokingAnAccountWithNoSessions(t *testing.T) {
	ctx := context.Background()
	s := NewStore(redisfixture.New(t).Handle)

	report, err := s.RevokeAllSessions(ctx, "acct")
	if err != nil {
		t.Fatalf("revoke: %v", err)
	}
	if report.Sessions != 0 || report.Tokens != 0 {
		t.Fatalf("report = %+v, want an empty report", report)
	}
}

// The reauth deadline is not moved by a revoke, so a tombstone cannot outlive
// the session it is written on.
func TestATombstoneDoesNotOutliveItsSession(t *testing.T) {
	ctx := context.Background()
	s := NewStore(redisfixture.New(t).Handle)

	started := time.Now().UTC().Add(-2 * RefreshTokenTTL)
	if err := s.PutSession(ctx, "acct", Session{
		SessionID:        "sess-old",
		StartedAt:        started,
		ReauthRequiredAt: ReauthDeadlineFromSessionStart(started),
	}); err != nil {
		t.Fatalf("put session: %v", err)
	}

	if _, err := s.RevokeAllSessions(ctx, "acct"); err != nil {
		t.Fatalf("revoke: %v", err)
	}

	rec, err := s.LiveAccountRecord(ctx, "acct")
	if err != nil {
		t.Fatalf("read record: %v", err)
	}
	if _, held := rec.Sessions["sess-old"]; held {
		t.Fatal("a session past its reauth deadline should have been pruned, tombstone or not")
	}
}
