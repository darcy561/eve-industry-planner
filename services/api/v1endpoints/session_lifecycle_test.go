// End-to-end coverage of the session lifecycle: log in, refresh, log out.
//
// These drive the real handlers with real HTTP requests, against a fake EVE SSO
// and an in-process Redis, and assert what the browser sees and what Redis
// holds afterwards. They exist so a refactor underneath — the session helpers
// moving onto the Redis handle — is caught by what the endpoints do rather than
// only by unit tests of the helpers being changed.
package v1endpoints_test

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"eve-industry-planner/api/apideps"
	"eve-industry-planner/api/helper/auth"
	"eve-industry-planner/api/v1endpoints"
	"eve-industry-planner/shared/plannersession"
	sessionreq "eve-industry-planner/shared/plannersession/request"
	eipredis "eve-industry-planner/shared/redis"
	"eve-industry-planner/shared/stackservices"
	"eve-industry-planner/testing/esifake"
	"eve-industry-planner/testing/evessofake"
	"eve-industry-planner/testing/redisfake"
)

// session drives the endpoints that make up the lifecycle.
type session struct {
	handlers *v1endpoints.Handlers
	redis    *eipredis.Redis
	fake     *redisfake.Redis
}

func newSession(t *testing.T) *session {
	t.Helper()
	t.Setenv("EVE_CLIENT_ID", "test-eve-client-id")
	t.Setenv("EVE_CLIENT_SECRET", "test-eve-client-secret")
	// The login path loads the cloud-stored ESI keyring before it does anything
	// else, so without a key every request answers 500 whatever it asked for.
	t.Setenv("REFRESH_TOKEN_AES_KEY", base64.StdEncoding.EncodeToString(make([]byte, 32)))

	fake := redisfake.New(t)
	deps := apideps.FromClients(&stackservices.Clients{Redis: eipredis.NewRedis(fake.Client)}, nil, esifake.New(t), nil)

	return &session{
		handlers: v1endpoints.New(deps),
		redis:    eipredis.NewRedis(fake.Client),
		fake:     fake,
	}
}

// identity is what the auth middleware binds onto a request before a private
// handler sees it. A test names it rather than running the middleware, so a
// handler is exercised with the same inputs it gets in production.
type identity struct {
	accountID string
	sessionID string
}

func (s *session) post(t *testing.T, handler http.HandlerFunc, path string, body any, as *identity) *httptest.ResponseRecorder {
	t.Helper()

	var payload []byte
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("encode request: %v", err)
		}
		payload = encoded
	}

	req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	if as != nil {
		req = req.WithContext(sessionreq.WithIdentity(req.Context(), as.accountID, as.sessionID))
	}

	rec := httptest.NewRecorder()
	handler(rec, req)
	return rec
}

// seedSession puts a logged-in session into Redis the way a completed login
// leaves one, so the refresh and logout paths can be exercised without standing
// up the whole SSO exchange.
func (s *session) seedSession(t *testing.T, accountID, characterHash string) (sessionID, refreshToken string) {
	t.Helper()
	ctx := context.Background()

	sessionID, err := plannersession.GenerateSessionID()
	if err != nil {
		t.Fatalf("session id: %v", err)
	}

	refreshToken, err = auth.MintAndStoreRefreshToken(ctx, s.redis, plannersession.RefreshTokenData{
		CharacterHash: characterHash,
		AccountID:     accountID,
		SessionID:     sessionID,
	})
	if err != nil {
		t.Fatalf("mint refresh token: %v", err)
	}

	if err := plannersession.NewStore(s.redis).PutSession(ctx, accountID, plannersession.Session{
		SessionID:     sessionID,
		CharacterHash: characterHash,
	}); err != nil {
		t.Fatalf("upsert session: %v", err)
	}
	return sessionID, refreshToken
}

// keysUnder reports the stored keys sharing a prefix, so a test can say what a
// request left behind rather than naming each key.
//
// The assertions read Redis directly rather than through the auth helpers,
// because those helpers are what the session refactor changes: a test that
// asked them whether a token still resolves would agree with any rewrite that
// broke the writer and the reader in the same way.
func (s *session) keysUnder(prefix string) []string {
	var found []string
	for _, key := range s.fake.Server.Keys() {
		if strings.HasPrefix(key, prefix) {
			found = append(found, key)
		}
	}
	return found
}

// stored reports whether a key is present, without asking the code under test.
func (s *session) stored(key string) bool {
	return s.fake.Server.Exists(key)
}

func TestLogoutRevokesTheSession(t *testing.T) {
	s := newSession(t)

	const accountID = "acct-logout"
	sessionID, refreshToken := s.seedSession(t, accountID, "hash-logout")

	// The credentials are in Redis before logout.
	for _, key := range []string{
		plannersession.RefreshTokenKeyPrefix + refreshToken,
		plannersession.SessionRefreshIndexKeyPrefix + sessionID,
		plannersession.AccountSessionsKeyPrefix + accountID,
	} {
		if !s.stored(key) {
			t.Fatalf("%q was not stored before logout; keys = %v", key, s.fake.Server.Keys())
		}
	}

	rec := s.post(t, s.handlers.LogoutHandler, "/api/v1/sessions/logout",
		v1endpoints.LogoutRequest{RefreshToken: refreshToken},
		&identity{accountID: accountID, sessionID: sessionID})
	if rec.Code != http.StatusNoContent {
		t.Fatalf("logout = %d, body %s", rec.Code, rec.Body.String())
	}

	// The stored token is gone, so it cannot be replayed.
	if s.stored(plannersession.RefreshTokenKeyPrefix + refreshToken) {
		t.Error("the refresh token is still stored after logout")
	}

	// Nothing is left under the token or index prefixes for this session.
	if keys := s.keysUnder(plannersession.RefreshTokenKeyPrefix); len(keys) != 0 {
		t.Errorf("logout left refresh tokens behind: %v", keys)
	}
	if keys := s.keysUnder(plannersession.SessionRefreshIndexKeyPrefix); len(keys) != 0 {
		t.Errorf("logout left session-refresh indexes behind: %v", keys)
	}
}

// Logging out clears the cookies the browser holds, or the client keeps
// presenting credentials that no longer resolve.
func TestLogoutClearsItsCookies(t *testing.T) {
	s := newSession(t)
	sessionID, refreshToken := s.seedSession(t, "acct-cookies", "hash-cookies")

	rec := s.post(t, s.handlers.LogoutHandler, "/api/v1/sessions/logout",
		v1endpoints.LogoutRequest{RefreshToken: refreshToken},
		&identity{accountID: "acct-cookies", sessionID: sessionID})
	if rec.Code != http.StatusNoContent {
		t.Fatalf("logout = %d, body %s", rec.Code, rec.Body.String())
	}

	cleared := map[string]bool{}
	for _, c := range rec.Result().Cookies() {
		if c.MaxAge < 0 || c.Value == "" {
			cleared[c.Name] = true
		}
	}
	if len(cleared) == 0 {
		t.Fatalf("logout cleared no cookies; set %v", rec.Result().Cookies())
	}
}

// A token that was never issued must not look like a successful logout of
// someone else's session.
func TestLogoutWithAnUnknownTokenLeavesOtherSessionsAlone(t *testing.T) {
	s := newSession(t)

	_, keep := s.seedSession(t, "acct-keep", "hash-keep")

	unknown, err := plannersession.GenerateRefreshToken()
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	s.post(t, s.handlers.LogoutHandler, "/api/v1/sessions/logout",
		v1endpoints.LogoutRequest{RefreshToken: unknown},
		&identity{accountID: "acct-keep"})

	if !s.stored(plannersession.RefreshTokenKeyPrefix + keep) {
		t.Fatal("an unrelated session was revoked")
	}
}

func TestLogoutRejectsAMalformedRequest(t *testing.T) {
	s := newSession(t)

	for name, tc := range map[string]struct {
		body any
		want int
	}{
		"no refresh token":   {v1endpoints.LogoutRequest{}, http.StatusBadRequest},
		"an over-long token": {v1endpoints.LogoutRequest{RefreshToken: strings.Repeat("a", 600)}, http.StatusBadRequest},
	} {
		t.Run(name, func(t *testing.T) {
			rec := s.post(t, s.handlers.LogoutHandler, "/api/v1/sessions/logout", tc.body,
				&identity{accountID: "acct-malformed"})
			if rec.Code != tc.want {
				t.Fatalf("status = %d, want %d; body %s", rec.Code, tc.want, rec.Body.String())
			}
		})
	}
}

func TestLogoutRejectsANonPostRequest(t *testing.T) {
	s := newSession(t)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/sessions/logout", nil)
	rec := httptest.NewRecorder()
	s.handlers.LogoutHandler(rec, req)

	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, want 405", rec.Code)
	}
}

// seedExpiredSession puts a session in Redis whose reauth window has already
// elapsed, so the refresh path's periodic-SSO gate can be exercised.
func (s *session) seedExpiredSession(t *testing.T, accountID, characterHash string) (sessionID, refreshToken string) {
	t.Helper()
	ctx := context.Background()

	sessionID, err := plannersession.GenerateSessionID()
	if err != nil {
		t.Fatalf("session id: %v", err)
	}

	// Started longer ago than the refresh-token window, so the deadline derived
	// from session start has passed.
	startedAt := time.Now().UTC().Add(-plannersession.RefreshTokenTTL - time.Hour)

	refreshToken, err = auth.MintAndStoreRefreshToken(ctx, s.redis, plannersession.RefreshTokenData{
		CharacterHash: characterHash,
		AccountID:     accountID,
		SessionID:     sessionID,
		SessionStart:  startedAt,
	})
	if err != nil {
		t.Fatalf("mint refresh token: %v", err)
	}

	if err := plannersession.NewStore(s.redis).PutSession(ctx, accountID, plannersession.Session{
		SessionID:     sessionID,
		CharacterHash: characterHash,
		StartedAt:     startedAt,
		LastSeenAt:    startedAt,
	}); err != nil {
		t.Fatalf("upsert session: %v", err)
	}
	return sessionID, refreshToken
}

// A token that was never issued cannot be exchanged, which is what stops a
// stolen or guessed value being replayed as a session.
func TestRefreshRejectsAnUnknownToken(t *testing.T) {
	s := newSession(t)

	unknown, err := plannersession.GenerateRefreshToken()
	if err != nil {
		t.Fatalf("generate: %v", err)
	}

	rec := s.post(t, s.handlers.RotateHandler, "/api/v1/auth/sessions/rotate",
		v1endpoints.RefreshRequest{RefreshToken: unknown}, nil)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401; body %s", rec.Code, rec.Body.String())
	}
}

// A revoked token stays revoked: logging out and then presenting the old token
// must not resume the session.
func TestRefreshRejectsARevokedToken(t *testing.T) {
	s := newSession(t)

	const accountID = "acct-revoked"
	sessionID, refreshToken := s.seedSession(t, accountID, "hash-revoked")

	logout := s.post(t, s.handlers.LogoutHandler, "/api/v1/sessions/logout",
		v1endpoints.LogoutRequest{RefreshToken: refreshToken},
		&identity{accountID: accountID, sessionID: sessionID})
	if logout.Code != http.StatusNoContent {
		t.Fatalf("logout = %d", logout.Code)
	}

	rec := s.post(t, s.handlers.RotateHandler, "/api/v1/auth/sessions/rotate",
		v1endpoints.RefreshRequest{RefreshToken: refreshToken}, nil)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("a revoked token refreshed: status = %d, body %s", rec.Code, rec.Body.String())
	}
}

// The periodic-SSO gate: once the reauth window has elapsed the session cannot
// be rotated, however valid the token itself is.
func TestRefreshRequiresReauthOnceTheWindowElapses(t *testing.T) {
	s := newSession(t)
	_, refreshToken := s.seedExpiredSession(t, "acct-reauth", "hash-reauth")

	rec := s.post(t, s.handlers.RotateHandler, "/api/v1/auth/sessions/rotate",
		v1endpoints.RefreshRequest{RefreshToken: refreshToken}, nil)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401; body %s", rec.Code, rec.Body.String())
	}
	if body := rec.Body.String(); !strings.Contains(body, "reauth_required") {
		t.Fatalf("body = %s, want it to name reauth_required", body)
	}
	// The client is told to stop presenting what it holds.
	if len(rec.Result().Cookies()) == 0 {
		t.Error("a reauth-required response cleared no cookies")
	}
}

func TestRefreshRejectsAMalformedRequest(t *testing.T) {
	s := newSession(t)

	for name, tc := range map[string]struct {
		body any
		want int
	}{
		"no credentials at all":  {v1endpoints.RefreshRequest{}, http.StatusBadRequest},
		"an over-long token":     {v1endpoints.RefreshRequest{RefreshToken: strings.Repeat("a", 600)}, http.StatusBadRequest},
		"an over-long eve token": {v1endpoints.RefreshRequest{RefreshToken: "t", EveToken: strings.Repeat("a", 9000)}, http.StatusBadRequest},
	} {
		t.Run(name, func(t *testing.T) {
			rec := s.post(t, s.handlers.RotateHandler, "/api/v1/auth/sessions/rotate", tc.body, nil)
			if rec.Code != tc.want {
				t.Fatalf("status = %d, want %d; body %s", rec.Code, tc.want, rec.Body.String())
			}
		})
	}
}

func TestRefreshRejectsANonPostRequest(t *testing.T) {
	s := newSession(t)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/sessions/rotate", nil)
	rec := httptest.NewRecorder()
	s.handlers.RotateHandler(rec, req)

	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, want 405", rec.Code)
	}
}

// A refresh that does not complete must not consume the credential it was
// given: the client retries with the same token.
//
// The request here is refused before rotation — this harness wires no Mongo, so
// the cloud-resume path cannot run — which is exactly the shape of a transient
// failure part-way through.
func TestRefreshLeavesTheTokenStoredWhenItDoesNotComplete(t *testing.T) {
	s := newSession(t)
	_, refreshToken := s.seedSession(t, "acct-keeps", "hash-keeps")

	s.post(t, s.handlers.RotateHandler, "/api/v1/auth/sessions/rotate",
		v1endpoints.RefreshRequest{RefreshToken: refreshToken}, nil)

	if !s.stored(plannersession.RefreshTokenKeyPrefix + refreshToken) {
		t.Fatal("an incomplete refresh consumed the token it was given")
	}
}

// A reauth-required refusal is final: the session cannot be rotated afterwards
// either, so an expired window is not merely a slow path.
func TestRefreshStaysRefusedAfterReauthRequired(t *testing.T) {
	s := newSession(t)
	_, refreshToken := s.seedExpiredSession(t, "acct-again", "hash-again")

	for attempt := range 2 {
		rec := s.post(t, s.handlers.RotateHandler, "/api/v1/auth/sessions/rotate",
			v1endpoints.RefreshRequest{RefreshToken: refreshToken}, nil)
		if rec.Code != http.StatusUnauthorized {
			t.Fatalf("attempt %d: status = %d, want 401", attempt+1, rec.Code)
		}
	}
}

// withSSO points the session harness at a fake EVE SSO, so a login can present
// a genuinely signed token that the production validator accepts.
func (s *session) withSSO(t *testing.T) *evessofake.Server {
	t.Helper()
	return evessofake.Start(t, "test-eve-client-id")
}

// A login with a token EVE SSO never issued must not create a session. The
// token is signed by a different key, so it fails signature verification rather
// than a claim check.
func TestLoginRejectsATokenSignedByAnother(t *testing.T) {
	s := newSession(t)
	sso := s.withSSO(t)

	rec := s.post(t, s.handlers.AuthHandler, "/api/v1/auth/eve-token",
		map[string]string{"token": sso.TokenSignedByAnother()}, nil)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401; body %s", rec.Code, rec.Body.String())
	}
	if keys := s.keysUnder(plannersession.RefreshTokenKeyPrefix); len(keys) != 0 {
		t.Fatalf("a forged token minted credentials: %v", keys)
	}
	if keys := s.keysUnder(plannersession.AccountSessionsKeyPrefix); len(keys) != 0 {
		t.Fatalf("a forged token created a session: %v", keys)
	}
}

// An expired token is refused for the same reason: a session must not outlive
// the credential that established it.
func TestLoginRejectsAnExpiredToken(t *testing.T) {
	s := newSession(t)
	sso := s.withSSO(t)

	rec := s.post(t, s.handlers.AuthHandler, "/api/v1/auth/eve-token",
		map[string]string{"token": sso.ExpiredAccessToken()}, nil)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401; body %s", rec.Code, rec.Body.String())
	}
	if keys := s.keysUnder(plannersession.RefreshTokenKeyPrefix); len(keys) != 0 {
		t.Fatalf("an expired token minted credentials: %v", keys)
	}
}

// A login that mints its session and then cannot read the account's documents
// must leave nothing behind. The session id reaches the browser only in the
// response body, so material stranded here can never be presented, recovered or
// revoked by anyone — it sits until the sweep, and it counts as a session that
// was never issued.
//
// The Mongo handle is nil in this harness, which is what the document read
// fails on.
func TestLoginLeavesNothingBehindWhenTheDocumentsCannotBeRead(t *testing.T) {
	s := newSession(t)
	sso := s.withSSO(t)

	rec := s.post(t, s.handlers.AuthHandler, "/api/v1/auth/eve-token",
		map[string]string{"token": sso.AccessToken()}, nil)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500; body %s", rec.Code, rec.Body.String())
	}
	if keys := s.keysUnder(plannersession.RefreshTokenKeyPrefix); len(keys) != 0 {
		t.Fatalf("a failed login left refresh material: %v", keys)
	}
	if keys := s.keysUnder(plannersession.SessionIndexKeyPrefix); len(keys) != 0 {
		t.Fatalf("a failed login left a session index: %v", keys)
	}
	if rec.Header().Get("Set-Cookie") != "" {
		t.Fatalf("a failed login set cookies: %q", rec.Header().Get("Set-Cookie"))
	}
}

// The same invariant one step earlier: the refresh token is minted before the
// session record is written, so a login that cannot write the record must not
// leave the token behind either.
//
// The account record is poisoned rather than the server made to fail, so the
// mint still succeeds and only the write under it does.
func TestLoginLeavesNothingBehindWhenTheSessionCannotBeStored(t *testing.T) {
	s := newSession(t)
	sso := s.withSSO(t)

	accountID := plannersession.AccountIDFromCharacterHash("owner-hash")
	if err := s.fake.Server.Set(plannersession.AccountSessionsKeyPrefix+accountID, "not-a-record"); err != nil {
		t.Fatalf("poison account record: %v", err)
	}

	rec := s.post(t, s.handlers.AuthHandler, "/api/v1/auth/eve-token",
		map[string]string{"token": sso.AccessToken()}, nil)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500; body %s", rec.Code, rec.Body.String())
	}
	if keys := s.keysUnder(plannersession.RefreshTokenKeyPrefix); len(keys) != 0 {
		t.Fatalf("a failed session write left refresh material: %v", keys)
	}
}

func TestLoginRejectsAMalformedRequest(t *testing.T) {
	s := newSession(t)

	for name, tc := range map[string]struct {
		body any
		want int
	}{
		"no token":           {map[string]string{}, http.StatusBadRequest},
		"an over-long token": {map[string]string{"token": strings.Repeat("a", 9000)}, http.StatusBadRequest},
	} {
		t.Run(name, func(t *testing.T) {
			rec := s.post(t, s.handlers.AuthHandler, "/api/v1/auth/eve-token", tc.body, nil)
			if rec.Code != tc.want {
				t.Fatalf("status = %d, want %d; body %s", rec.Code, tc.want, rec.Body.String())
			}
		})
	}
}

func TestLoginRejectsANonPostRequest(t *testing.T) {
	s := newSession(t)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/eve-token", nil)
	rec := httptest.NewRecorder()
	s.handlers.AuthHandler(rec, req)

	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, want 405", rec.Code)
	}
}

// Signing out everywhere is what a reader asks for when a machine they no longer
// have is still signed in.
func TestRevokeAllEndsEverySessionTheAccountHolds(t *testing.T) {
	s := newSession(t)

	const accountID = "acct-revoke-all"
	firstID, firstToken := s.seedSession(t, accountID, "hash-one")
	secondID, secondToken := s.seedSession(t, accountID, "hash-two")

	rec := s.post(t, s.handlers.RevokeAllSessionsHandler, "/api/v1/auth/sessions/revoke-all", nil,
		&identity{accountID: accountID, sessionID: firstID})
	if rec.Code != http.StatusOK {
		t.Fatalf("revoke-all = %d, body %s", rec.Code, rec.Body.String())
	}

	var body v1endpoints.RevokeAllSessionsResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if body.SessionsRevoked != 2 || body.TokensRevoked != 2 {
		t.Fatalf("response = %+v, want two sessions and two tokens", body)
	}

	for _, token := range []string{firstToken, secondToken} {
		if s.stored(plannersession.RefreshTokenKeyPrefix + token) {
			t.Errorf("refresh token %q survived the revoke", token)
		}
	}
	// The session ids still resolve: that is what lets a refused request say it
	// was revoked rather than that it was never known.
	for _, sessionID := range []string{firstID, secondID} {
		if !s.stored(plannersession.SessionIndexKeyPrefix + sessionID) {
			t.Errorf("session index for %q should survive so the tombstone can be read", sessionID)
		}
	}
}

// The tab that asks is revoked with the rest, and finds out on its next request.
func TestRevokeAllRefusesTheTabThatAskedForIt(t *testing.T) {
	s := newSession(t)

	const accountID = "acct-revoke-self"
	sessionID, _ := s.seedSession(t, accountID, "hash-self")

	if rec := s.post(t, s.handlers.RevokeAllSessionsHandler, "/api/v1/auth/sessions/revoke-all", nil,
		&identity{accountID: accountID, sessionID: sessionID}); rec.Code != http.StatusOK {
		t.Fatalf("revoke-all = %d, body %s", rec.Code, rec.Body.String())
	}

	next := httptest.NewRequest(http.MethodGet, "/api/v1/user/document", nil)
	next.Header.Set(sessionreq.SessionIDHeader, sessionID)

	_, err := sessionreq.ExtractSession(context.Background(), next, plannersession.NewStore(s.redis))
	var sessErr *sessionreq.SessionError
	if !errors.As(err, &sessErr) {
		t.Fatalf("next request should be refused with a session error, got %v", err)
	}
	if sessErr.Code != sessionreq.CodeSessionRevoked {
		t.Fatalf("code = %q, want %q", sessErr.Code, sessionreq.CodeSessionRevoked)
	}
}

func TestRevokeAllLeavesOtherAccountsSignedIn(t *testing.T) {
	s := newSession(t)

	mineID, _ := s.seedSession(t, "acct-mine", "hash-mine")
	_, theirToken := s.seedSession(t, "acct-theirs", "hash-theirs")

	if rec := s.post(t, s.handlers.RevokeAllSessionsHandler, "/api/v1/auth/sessions/revoke-all", nil,
		&identity{accountID: "acct-mine", sessionID: mineID}); rec.Code != http.StatusOK {
		t.Fatalf("revoke-all = %d, body %s", rec.Code, rec.Body.String())
	}

	if !s.stored(plannersession.RefreshTokenKeyPrefix + theirToken) {
		t.Error("another account's refresh token was revoked")
	}
}

func TestRevokeAllRefusesARequestWithNoSession(t *testing.T) {
	s := newSession(t)

	rec := s.post(t, s.handlers.RevokeAllSessionsHandler, "/api/v1/auth/sessions/revoke-all", nil, nil)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("revoke-all = %d, want 401; body %s", rec.Code, rec.Body.String())
	}
}

func TestRevokeAllRejectsANonPostRequest(t *testing.T) {
	s := newSession(t)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/sessions/revoke-all", nil)
	req = req.WithContext(sessionreq.WithIdentity(req.Context(), "acct", "sess"))
	rec := httptest.NewRecorder()
	s.handlers.RevokeAllSessionsHandler(rec, req)

	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("revoke-all = %d, want 405", rec.Code)
	}
}
