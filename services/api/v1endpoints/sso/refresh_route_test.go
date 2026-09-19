package sso_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"eve-industry-planner/api/apideps"
	"eve-industry-planner/api/helper/auth"
	ssoendpoints "eve-industry-planner/api/v1endpoints/sso"
	"eve-industry-planner/shared/esiclient"
	eipredis "eve-industry-planner/shared/redis"
	"eve-industry-planner/shared/stackservices"
	"eve-industry-planner/testing/esifake"
	"eve-industry-planner/testing/evessofake"
	"eve-industry-planner/testing/redisfake"

	"github.com/redis/go-redis/v9"
)

const routeClientID = "test-eve-client-id"

// route drives the refresh endpoint the way the mux does: real handler, real
// request decoding, real outbound call to a fake EVE SSO, real JWT validation
// of whatever comes back.
type route struct {
	handler *ssoendpoints.Handlers
	sso     *evessofake.Server
	esi     *esifake.Client
	redis   *redis.Client
}

func newRoute(t *testing.T) *route {
	t.Helper()
	t.Setenv("EVE_CLIENT_ID", routeClientID)
	t.Setenv("EVE_CLIENT_SECRET", "test-eve-client-secret")

	sso := evessofake.Start(t, routeClientID)
	esi := esifake.New(t)
	fake := redisfake.New(t)
	rdb := fake.Client

	deps := apideps.FromClients(&stackservices.Clients{Redis: eipredis.NewRedis(fake.Client)}, nil, esi, nil)
	return &route{handler: ssoendpoints.New(deps), sso: sso, esi: esi, redis: rdb}
}

func (rt *route) refresh(t *testing.T, body any) *httptest.ResponseRecorder {
	t.Helper()
	encoded, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("encode request: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/eve-sso/tokens/refresh", bytes.NewReader(encoded))
	req.Header.Set("Content-Type", "application/json")

	rec := httptest.NewRecorder()
	rt.handler.EveSSORefreshHandler(rec, req)
	return rec
}

func TestRefreshRouteReturnsATokenTheAppCanUse(t *testing.T) {
	rt := newRoute(t)

	rec := rt.refresh(t, map[string]string{"refresh_token": "a-stored-refresh-token"})

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200. body: %s", rec.Code, rec.Body.String())
	}

	var payload struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
		TokenType    string `json:"token_type"`
		ExpiresIn    int    `json:"expires_in"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v — body %s", err, rec.Body.String())
	}
	if payload.AccessToken == "" {
		t.Error("no access token was returned")
	}
	if payload.RefreshToken == "" {
		t.Error("no rotated refresh token was returned; the next refresh would reuse a spent one")
	}
	if payload.ExpiresIn <= 0 {
		t.Errorf("ExpiresIn = %d, want the lifetime SSO stated", payload.ExpiresIn)
	}

	if got := rt.sso.Exchanges("refresh_token"); got != 1 {
		t.Errorf("made %d refresh_token calls to SSO, want exactly 1", got)
	}
}

func TestRefreshRouteTellsTheLimiterTheServersAnswered(t *testing.T) {
	rt := newRoute(t)

	rt.refresh(t, map[string]string{"refresh_token": "a-stored-refresh-token"})

	observed := rt.esi.Observations()
	if len(observed) != 1 {
		t.Fatalf("made %d observations, want 1 — the api is a second source of evidence", len(observed))
	}
	if !observed[0].Reachable {
		t.Error("a successful refresh was reported as the servers being away")
	}
	if observed[0].Source != "evesso" {
		t.Errorf("source = %q, want evesso so the spread rule counts it separately", observed[0].Source)
	}
}

func TestRefreshRouteReportsARefusedTokenAsTheServerAnswering(t *testing.T) {
	// The trap this guards: a wave of expired tokens must not read as an outage.
	rt := newRoute(t)
	rt.sso.Refuse(http.StatusBadRequest, `{"error":"invalid_grant","error_description":"token is expired"}`)

	rec := rt.refresh(t, map[string]string{"refresh_token": "an-expired-token"})

	if rec.Code == http.StatusOK {
		t.Fatalf("a refused token produced a 200: %s", rec.Body.String())
	}

	observed := rt.esi.Observations()
	if len(observed) != 1 {
		t.Fatalf("made %d observations, want 1", len(observed))
	}
	if !observed[0].Reachable {
		t.Error("a refused grant was reported as an outage; SSO answered, it just said no")
	}
}

func TestRefreshRouteReportsSilenceAsAnOutage(t *testing.T) {
	rt := newRoute(t)
	rt.sso.GoDown()

	rec := rt.refresh(t, map[string]string{"refresh_token": "a-stored-refresh-token"})

	if rec.Code == http.StatusOK {
		t.Fatalf("a dead SSO produced a 200: %s", rec.Body.String())
	}

	observed := rt.esi.Observations()
	if len(observed) == 0 {
		t.Fatal("nothing was reported, so the fleet learns nothing from the api hitting a dead SSO")
	}
	if observed[len(observed)-1].Reachable {
		t.Error("silence was reported as the servers answering")
	}
}

func TestRefreshRouteStillServesWhileTheGateIsClosed(t *testing.T) {
	// A login is what a person is waiting on. The gate is fed but never
	// consulted here, so a trip — right or wrong — must not lock anyone out.
	rt := newRoute(t)
	rt.esi.SetAvailability(esiclient.DowntimeState{Gated: true, NextProbe: time.Now().Add(time.Minute), Failures: 5})

	rec := rt.refresh(t, map[string]string{"refresh_token": "a-stored-refresh-token"})

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d while the gate was closed; a login must not be refused on it. body: %s",
			rec.Code, rec.Body.String())
	}
}

func TestRefreshRouteRejectsABodyItCannotUse(t *testing.T) {
	rt := newRoute(t)

	for _, body := range []any{
		map[string]string{},
		map[string]string{"refresh_token": ""},
		map[string]string{"refresh_token": "   "},
	} {
		rec := rt.refresh(t, body)
		if rec.Code != http.StatusBadRequest {
			t.Errorf("body %v produced %d, want 400", body, rec.Code)
		}
	}

	if got := rt.sso.Exchanges("refresh_token"); got != 0 {
		t.Errorf("called SSO %d times for requests that never had a token", got)
	}
}

// exchange posts a callback the way a browser that started the sign-in here
// does: carrying a state this API issued it, in the body and in the cookie.
func (rt *route) exchange(t *testing.T, body any) *httptest.ResponseRecorder {
	t.Helper()
	state := rt.signInState(t)
	if fields, ok := body.(map[string]any); ok {
		if _, named := fields["state"]; !named {
			fields["state"] = state
		}
	}
	return rt.exchangeAsIs(t, body, state)
}

// exchangeAsIs posts exactly what it is given, for the cases about the state
// itself. A cookie value of "" sends no cookie at all.
func (rt *route) exchangeAsIs(t *testing.T, body any, cookie string) *httptest.ResponseRecorder {
	t.Helper()
	encoded, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("encode request: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/eve-sso/tokens/exchange", bytes.NewReader(encoded))
	req.Header.Set("Content-Type", "application/json")
	if cookie != "" {
		req.AddCookie(&http.Cookie{Name: auth.SignInStateCookieName, Value: cookie})
	}

	rec := httptest.NewRecorder()
	rt.handler.EveSSOExchangeHandler(rec, req)
	return rec
}

// signInState takes a state from the route that issues them, rather than
// inventing one, so the tests exercise the pair as a browser meets it.
func (rt *route) signInState(t *testing.T) string {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/eve-sso/sign-in-state", nil)
	rec := httptest.NewRecorder()
	rt.handler.SignInStateHandler(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("sign-in state = %d, body %s", rec.Code, rec.Body.String())
	}

	var issued struct {
		State string `json:"state"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &issued); err != nil {
		t.Fatalf("decode sign-in state: %v", err)
	}
	if issued.State == "" {
		t.Fatal("the sign-in state route returned nothing to carry")
	}
	return issued.State
}

func TestExchangeRouteTradesACodeForAToken(t *testing.T) {
	rt := newRoute(t)

	rec := rt.exchange(t, map[string]any{"auth_code": "a-code-from-the-callback"})

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200. body: %s", rec.Code, rec.Body.String())
	}
	if got := rt.sso.Exchanges("authorization_code"); got != 1 {
		t.Errorf("made %d authorization_code calls to SSO, want exactly 1", got)
	}
}

func TestExchangeRouteFeedsTheGateToo(t *testing.T) {
	// The first step of a login is an SSO call like any other, and its silence
	// is evidence the same way.
	rt := newRoute(t)
	rt.sso.GoDown()

	rt.exchange(t, map[string]any{"auth_code": "a-code-from-the-callback"})

	observed := rt.esi.Observations()
	if len(observed) == 0 {
		t.Fatal("the exchange route reported nothing; a dead SSO here teaches the fleet nothing")
	}
	if observed[len(observed)-1].Reachable {
		t.Error("silence was reported as the servers answering")
	}
}

func TestExchangeRouteStillServesWhileTheGateIsClosed(t *testing.T) {
	rt := newRoute(t)
	rt.esi.SetAvailability(esiclient.DowntimeState{Gated: true, NextProbe: time.Now().Add(time.Minute), Failures: 5})

	rec := rt.exchange(t, map[string]any{"auth_code": "a-code-from-the-callback"})

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d while the gate was closed; signing in must not be refused on it. body: %s",
			rec.Code, rec.Body.String())
	}
}

func TestExchangeRouteRejectsABodyItCannotUse(t *testing.T) {
	rt := newRoute(t)

	for _, body := range []any{
		map[string]any{},
		map[string]any{"auth_code": ""},
		map[string]any{"auth_code": "   "},
	} {
		if rec := rt.exchange(t, body); rec.Code != http.StatusBadRequest {
			t.Errorf("body %v produced %d, want 400", body, rec.Code)
		}
	}
	if got := rt.sso.Exchanges("authorization_code"); got != 0 {
		t.Errorf("called SSO %d times for requests that never had a code", got)
	}
}

// The hole this closes: a crafted `/auth?code=<attacker's code>` used to sign a
// reader into the attacker's character, because nothing checked that the
// callback answered a sign-in this browser started.
func TestExchangeRefusesACallbackThisBrowserDidNotStart(t *testing.T) {
	rt := newRoute(t)

	rec := rt.exchangeAsIs(t, map[string]any{
		"auth_code": "the-attackers-code",
		"state":     "a-state-the-attacker-chose",
	}, "")

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400. body: %s", rec.Code, rec.Body.String())
	}
	// The code must not be spent: refusing after trading it with CCP would still
	// have completed the attacker's half of the exchange.
	if got := rt.sso.Exchanges("authorization_code"); got != 0 {
		t.Errorf("made %d authorization_code calls to SSO, want none", got)
	}
}

// A browser mid-sign-in is the case an attacker would aim for: it holds a state,
// so the only thing left is to make it present a different one.
func TestExchangeRefusesAStateThatIsNotTheOneIssued(t *testing.T) {
	rt := newRoute(t)
	issued := rt.signInState(t)

	rec := rt.exchangeAsIs(t, map[string]any{
		"auth_code": "the-attackers-code",
		"state":     issued + "-tampered",
	}, issued)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400. body: %s", rec.Code, rec.Body.String())
	}
	if got := rt.sso.Exchanges("authorization_code"); got != 0 {
		t.Errorf("made %d authorization_code calls to SSO, want none", got)
	}
}

func TestExchangeRefusesACallbackCarryingNoState(t *testing.T) {
	rt := newRoute(t)
	issued := rt.signInState(t)

	rec := rt.exchangeAsIs(t, map[string]any{"auth_code": "a-code"}, issued)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400. body: %s", rec.Code, rec.Body.String())
	}
}

// A state is spent on use, so a code replayed against it a second time has
// nothing to match.
func TestAStateIsGoodForOneCallback(t *testing.T) {
	rt := newRoute(t)
	issued := rt.signInState(t)

	if rec := rt.exchangeAsIs(t, map[string]any{
		"auth_code": "a-code-from-the-callback",
		"state":     issued,
	}, issued); rec.Code != http.StatusOK {
		t.Fatalf("first exchange = %d, body %s", rec.Code, rec.Body.String())
	}

	// The browser is told to drop the cookie, so the replay arrives without one.
	replay := rt.exchangeAsIs(t, map[string]any{
		"auth_code": "a-code-from-the-callback",
		"state":     issued,
	}, "")
	if replay.Code != http.StatusBadRequest {
		t.Fatalf("replay = %d, want 400. body: %s", replay.Code, replay.Body.String())
	}
}

// The cookie is what binds the state to the browser, so it has to be unreadable
// by script and has to survive the top-level return from login.eveonline.com.
func TestTheSignInStateCookieIsBoundToTheBrowser(t *testing.T) {
	rt := newRoute(t)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/eve-sso/sign-in-state", nil)
	rec := httptest.NewRecorder()
	rt.handler.SignInStateHandler(rec, req)

	cookies := rec.Result().Cookies()
	var state *http.Cookie
	for _, c := range cookies {
		if c.Name == auth.SignInStateCookieName {
			state = c
		}
	}
	if state == nil {
		t.Fatalf("no %s cookie was set; cookies = %v", auth.SignInStateCookieName, cookies)
	}
	if !state.HttpOnly {
		t.Error("the cookie must not be readable by script")
	}
	if !state.Secure {
		t.Error("the cookie must not travel in the clear")
	}
	// The exchange is issued from a page already on this origin, so Strict still
	// sends it — and the path keeps it off the cross-site return from EVE entirely.
	if state.SameSite != http.SameSiteStrictMode {
		t.Errorf("SameSite = %v, want Strict", state.SameSite)
	}
	if state.Value == "" {
		t.Error("the cookie carries nothing to compare against")
	}
}

// Two browsers signing in at once must not be handed the same value.
func TestEveryStateIsItsOwn(t *testing.T) {
	rt := newRoute(t)

	seen := map[string]struct{}{}
	for range 10 {
		state := rt.signInState(t)
		if _, repeated := seen[state]; repeated {
			t.Fatalf("the same state was issued twice: %q", state)
		}
		seen[state] = struct{}{}
	}
}

func TestSignInStateRejectsANonPostRequest(t *testing.T) {
	rt := newRoute(t)

	rec := httptest.NewRecorder()
	rt.handler.SignInStateHandler(rec, httptest.NewRequest(http.MethodGet, "/api/v1/eve-sso/sign-in-state", nil))

	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, want 405", rec.Code)
	}
}

// Two sign-ins at once is ordinary: a session expires in one tab while a
// character is being linked in another. A browser that could hold only one would
// have the second overwrite the first and refuse both.
func TestTwoSignInsAtOnceBothComplete(t *testing.T) {
	rt := newRoute(t)

	first := rt.signInState(t)
	second := rt.signInStateHolding(t, first)
	both := strings.Join([]string{second, first}, ",")

	if rec := rt.exchangeAsIs(t, map[string]any{
		"auth_code": "the-first-callback",
		"state":     first,
	}, both); rec.Code != http.StatusOK {
		t.Fatalf("the earlier sign-in = %d, body %s", rec.Code, rec.Body.String())
	}

	// The first exchange hands back what is left, which still names the second.
	if rec := rt.exchangeAsIs(t, map[string]any{
		"auth_code": "the-second-callback",
		"state":     second,
	}, second); rec.Code != http.StatusOK {
		t.Fatalf("the later sign-in = %d, body %s", rec.Code, rec.Body.String())
	}
}

// A callback somebody else caused must not cancel a sign-in the reader is in the
// middle of.
func TestARefusedCallbackLeavesALiveSignInAlone(t *testing.T) {
	rt := newRoute(t)
	issued := rt.signInState(t)

	if rec := rt.exchangeAsIs(t, map[string]any{
		"auth_code": "the-attackers-code",
		"state":     "not-one-of-ours",
	}, issued); rec.Code != http.StatusBadRequest {
		t.Fatalf("the refusal = %d, want 400", rec.Code)
	}

	if rec := rt.exchangeAsIs(t, map[string]any{
		"auth_code": "a-code-from-the-callback",
		"state":     issued,
	}, issued); rec.Code != http.StatusOK {
		t.Fatalf("the reader's own sign-in = %d, body %s", rec.Code, rec.Body.String())
	}
}

// signInStateHolding mints while the browser already carries `held`, as a second
// tab starting a sign-in does.
func (rt *route) signInStateHolding(t *testing.T, held string) string {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/eve-sso/sign-in-state", nil)
	req.AddCookie(&http.Cookie{Name: auth.SignInStateCookieName, Value: held})
	rec := httptest.NewRecorder()
	rt.handler.SignInStateHandler(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("sign-in state = %d, body %s", rec.Code, rec.Body.String())
	}

	var issued struct {
		State string `json:"state"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &issued); err != nil {
		t.Fatalf("decode sign-in state: %v", err)
	}
	return issued.State
}

// The mint writes the cookie from what the request carries, and SameSite=Strict
// means a cross-site request carries none of it — so a forged one from any page
// would replace a reader's live sign-ins rather than add to them. One is enough
// to strand a login already under way.
func TestTheMintRefusesAnotherSite(t *testing.T) {
	rt := newRoute(t)
	issued := rt.signInState(t)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/eve-sso/sign-in-state", nil)
	req.Header.Set("Sec-Fetch-Site", "cross-site")
	rec := httptest.NewRecorder()
	rt.handler.SignInStateHandler(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want 403. body: %s", rec.Code, rec.Body.String())
	}
	if cookies := rec.Result().Cookies(); len(cookies) != 0 {
		t.Fatalf("a refused mint wrote cookies: %v", cookies)
	}
	// The reader's own sign-in still completes.
	if got := rt.exchangeAsIs(t, map[string]any{
		"auth_code": "a-code-from-the-callback",
		"state":     issued,
	}, issued); got.Code != http.StatusOK {
		t.Fatalf("the reader's sign-in = %d, body %s", got.Code, got.Body.String())
	}
}

// The SPA's own mint is a fetch from a page on this origin, and a browser that
// sends no Sec-Fetch-Site at all is not judged on it.
func TestTheMintAcceptsItsOwnSite(t *testing.T) {
	rt := newRoute(t)

	for _, site := range []string{"same-origin", "none", ""} {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/eve-sso/sign-in-state", nil)
		if site != "" {
			req.Header.Set("Sec-Fetch-Site", site)
		}
		rec := httptest.NewRecorder()
		rt.handler.SignInStateHandler(rec, req)

		if rec.Code != http.StatusOK {
			t.Errorf("Sec-Fetch-Site %q = %d, want 200", site, rec.Code)
		}
	}
}
