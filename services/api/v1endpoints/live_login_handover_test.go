// The login trace joined end to end: a signed EVE token in, and the session the
// other services read out.
//
// live_session_lifecycle_test.go stops at the login response body, and
// testing/sessionhandover starts from a session it hand-writes on the API's
// behalf. Both pass while disagreeing about what login stores, so this runs the
// real handler and hands what it wrote to the readers.
//
// Requires EIP_MONGO_PARITY_LIVE=1.
package v1endpoints_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"eve-industry-planner/api/middleware"
	"eve-industry-planner/shared/models"
	"eve-industry-planner/shared/plannersession"
	"eve-industry-planner/shared/plannersession/maintenance"
	sessionreq "eve-industry-planner/shared/plannersession/request"
)

// A completed login writes a session every other service then reads by its own
// path. The websocket takes the id from a query parameter, the API's middleware
// from a header, and the core's sweep walks the same keyspace — so a login that
// wrote a shape only one of them understands is a login that works until the
// second service touches it.
func TestLive_theSessionALoginWritesIsReadableByEveryService(t *testing.T) {
	ctx := context.Background()
	s := newLiveSession(t)
	store := plannersession.NewStore(s.redis)

	body, status := s.login(t, s.sso.AccessToken())
	if status != http.StatusOK {
		t.Fatalf("login = %d", status)
	}
	accountID := liveScratchAccount()

	// The websocket's upgrade path.
	wsRequest := httptest.NewRequest(http.MethodGet,
		"/ws?"+sessionreq.SessionIDQueryParam+"="+body.SessionID, nil)
	identity, err := sessionreq.ExtractSession(ctx, wsRequest, store)
	if err != nil {
		t.Fatalf("the websocket cannot read the session the login wrote: %v", err)
	}
	if identity.AccountID != accountID {
		t.Fatalf("websocket resolved account %q, want %q", identity.AccountID, accountID)
	}

	// The API's auth middleware, presenting the same session as a header.
	var seen *sessionreq.Identity
	handler := middleware.AuthConstructor(s.redis)(http.HandlerFunc(
		func(_ http.ResponseWriter, r *http.Request) {
			got, ok := sessionreq.TryExtractSession(r.Context(), r, store)
			if !ok {
				t.Error("the middleware admitted a request it could not resolve")
				return
			}
			seen = got
			if id := sessionreq.AccountIDFromContext(r.Context()); id != accountID {
				t.Errorf("middleware bound account %q to the context, want %q", id, accountID)
			}
		}))

	apiRequest := httptest.NewRequest(http.MethodGet, "/api/v1/anything", nil)
	apiRequest.Header.Set(sessionreq.SessionIDHeader, body.SessionID)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, apiRequest)

	if recorder.Code != http.StatusOK {
		t.Fatalf("the API middleware rejected the login's own session with %d", recorder.Code)
	}
	if seen == nil {
		t.Fatal("the handler never ran")
	}

	// The login resolves grants from the account's membership rows. A new
	// account has none, but it reaches itself: a session that cannot read its
	// own account is a session that can read nothing.
	if !seen.Session.Grants.Allows(models.AccountOwner(accountID)) {
		t.Error("the login's session cannot reach its own account")
	}

	// The core's sweep runs over the same keyspace and must leave it alone.
	if _, err := maintenance.Run(ctx, store, maintenance.Options{}); err != nil {
		t.Fatalf("core maintenance sweep: %v", err)
	}
	if _, err := sessionreq.ExtractSession(ctx, wsRequest, store); err != nil {
		t.Fatalf("the sweep broke the session the login had just written: %v", err)
	}
}

// The refresh token in the response body is the one the browser presents to
// rotate, so it has to be the token Redis holds, naming this login's own
// session. A login that returned one value and stored another would hand a
// client a credential nothing can resolve.
func TestLive_theRefreshTokenHandedBackNamesTheSessionItBelongsTo(t *testing.T) {
	ctx := context.Background()
	s := newLiveSession(t)
	store := plannersession.NewStore(s.redis)

	body, status := s.login(t, s.sso.AccessToken())
	if status != http.StatusOK {
		t.Fatalf("login = %d", status)
	}

	data, found, err := store.RefreshToken(ctx, body.RefreshToken)
	if err != nil {
		t.Fatalf("read the refresh token the login returned: %v", err)
	}
	if !found {
		t.Fatal("the refresh token handed to the browser is not stored")
	}
	if data.AccountID != liveScratchAccount() {
		t.Fatalf("the stored token names account %q, want %q", data.AccountID, liveScratchAccount())
	}
	if data.SessionID != body.SessionID {
		t.Fatalf("the stored token names session %q, want the session the login returned %q",
			data.SessionID, body.SessionID)
	}
	if data.CharacterHash != liveScratchHash {
		t.Fatalf("the stored token names character %q, want %q", data.CharacterHash, liveScratchHash)
	}

	// The session id and the token are indexed at each other, which is what lets
	// a rotate find the credential for the session presenting it.
	token, found, err := store.TokenForSession(ctx, body.SessionID)
	if err != nil {
		t.Fatalf("resolve the token for the session: %v", err)
	}
	if !found {
		t.Fatal("the login's session points at no refresh token")
	}
	if token != body.RefreshToken {
		t.Fatalf("the session points at token %q, want the one handed to the browser", token)
	}
}
