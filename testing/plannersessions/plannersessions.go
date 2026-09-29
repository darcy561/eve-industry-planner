// Package plannersessions seeds the planner sessions a test connects with, so
// every suite that needs a working one writes the same shape.
package plannersessions

import (
	"context"
	"testing"
	"time"

	"eve-industry-planner/shared/models"
	"eve-industry-planner/shared/plannersession"
	eipredis "eve-industry-planner/shared/redis"
)

// CharacterHash is the character every seeded session is held by, which nothing
// reads for its value.
const CharacterHash = "eip-test-session-hash"

// Open seeds a live session, and the owners it is granted where any are named.
func Open(t testing.TB, redis *eipredis.Redis, accountID, sessionID string, granted models.OwnerKeys) {
	t.Helper()
	now := time.Now().UTC()
	put(t, redis, accountID, plannersession.Session{
		SessionID:        sessionID,
		CharacterHash:    CharacterHash,
		StartedAt:        now,
		LastSeenAt:       now,
		ReauthRequiredAt: plannersession.ReauthDeadlineFromSessionStart(now),
	})

	if len(granted) == 0 {
		return
	}
	if err := plannersession.NewStore(redis).
		SetGrants(context.Background(), accountID, granted); err != nil {
		t.Fatalf("grant %s: %v", sessionID, err)
	}
}

// Revoked seeds a session a reader must refuse as revoked.
func Revoked(t testing.TB, redis *eipredis.Redis, accountID, sessionID string) {
	t.Helper()
	now := time.Now().UTC()
	revoked := now.Add(-time.Minute)
	put(t, redis, accountID, plannersession.Session{
		SessionID:        sessionID,
		CharacterHash:    CharacterHash,
		StartedAt:        now,
		LastSeenAt:       now,
		ReauthRequiredAt: plannersession.ReauthDeadlineFromSessionStart(now),
		RevokedAt:        &revoked,
	})
}

// Elapsed seeds a session whose reauth window closed while it was connected.
func Elapsed(t testing.TB, redis *eipredis.Redis, accountID, sessionID string) {
	t.Helper()
	started := time.Now().UTC().Add(-plannersession.RefreshTokenTTL - time.Hour)
	put(t, redis, accountID, plannersession.Session{
		SessionID:        sessionID,
		CharacterHash:    CharacterHash,
		StartedAt:        started,
		LastSeenAt:       started,
		ReauthRequiredAt: plannersession.ReauthDeadlineFromSessionStart(started),
	})
}

// put writes the session and the index a reader finds its account by.
func put(t testing.TB, redis *eipredis.Redis, accountID string, session plannersession.Session) {
	t.Helper()
	store := plannersession.NewStore(redis)
	ctx := context.Background()
	if err := store.PutSession(ctx, accountID, session); err != nil {
		t.Fatalf("seed session %s: %v", session.SessionID, err)
	}
	if err := store.PutSessionIndex(ctx, session.SessionID, accountID); err != nil {
		t.Fatalf("index session %s: %v", session.SessionID, err)
	}
}
