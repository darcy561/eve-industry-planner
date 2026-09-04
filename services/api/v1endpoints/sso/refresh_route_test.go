package sso_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"eve-industry-planner/api/apideps"
	ssoendpoints "eve-industry-planner/api/v1endpoints/sso"
	"eve-industry-planner/shared/esiclient"
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
	rdb := redisfake.New(t).Client

	deps := apideps.FromClients(&stackservices.Clients{Redis: rdb}, nil, esi)
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
