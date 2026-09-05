package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"eve-industry-planner/api/helper/auth"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/testing/redisfake"

	"github.com/redis/go-redis/v9"
)

func seedValidAccountSession(t *testing.T, rdb *redis.Client, accountID, sessionID string) {
	t.Helper()
	ctx := t.Context()
	now := time.Now().UTC()
	rec := &auth.AccountSessionsRecord{
		AccountID: accountID,
		Sessions: map[string]auth.AccountSession{
			sessionID: {
				SessionID:        sessionID,
				CharacterHash:    "hash-test",
				StartedAt:        now,
				LastSeenAt:       now,
				ReauthRequiredAt: auth.ReauthDeadlineFromSessionStart(now),
			},
		},
	}
	if err := auth.SaveAccountSessionsRecord(ctx, rdb, rec); err != nil {
		t.Fatalf("SaveAccountSessionsRecord: %v", err)
	}
	if err := rdb.Set(ctx, auth.SessionIndexKeyPrefix+sessionID, accountID, auth.SessionTTL).Err(); err != nil {
		t.Fatalf("set session index: %v", err)
	}
}

func TestOptionalAccountLogConstructor_BindsValidSession(t *testing.T) {
	t.Parallel()

	rdb := redisfake.New(t).Client

	const (
		accountID = "acct-public"
		sessionID = "sess-public"
	)
	seedValidAccountSession(t, rdb, accountID, sessionID)

	var gotAccountID, gotSessionID string
	handler := OptionalAccountLogConstructor(rdb)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAccountID = logs.RequestAccountIDFromContext(r.Context())
		gotSessionID = logs.RequestSessionIDFromContext(r.Context())
		w.WriteHeader(http.StatusNoContent)
	}))

	req := httptest.NewRequest(http.MethodPost, "/api/v1/feedback", nil)
	req.AddCookie(&http.Cookie{Name: auth.AppSessionCookieName, Value: sessionID})
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d", rec.Code)
	}
	if gotAccountID != accountID {
		t.Fatalf("account_id = %q", gotAccountID)
	}
	if gotSessionID != sessionID {
		t.Fatalf("session_id = %q", gotSessionID)
	}
}

func TestAuthConstructor_BindsRequestIdentityOnSuccess(t *testing.T) {
	t.Parallel()

	rdb := redisfake.New(t).Client

	const (
		accountID = "acct-private"
		sessionID = "sess-private"
	)
	seedValidAccountSession(t, rdb, accountID, sessionID)

	var gotAccountID, gotSessionID string
	handler := AuthConstructor(rdb)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAccountID = logs.RequestAccountIDFromContext(r.Context())
		gotSessionID = logs.RequestSessionIDFromContext(r.Context())
		w.WriteHeader(http.StatusNoContent)
	}))

	req := httptest.NewRequest(http.MethodPost, "/api/v1/corporation-claims", nil)
	req.AddCookie(&http.Cookie{Name: auth.AppSessionCookieName, Value: sessionID})
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d", rec.Code)
	}
	if gotAccountID != accountID {
		t.Fatalf("account_id = %q", gotAccountID)
	}
	if gotSessionID != sessionID {
		t.Fatalf("session_id = %q", gotSessionID)
	}
}
