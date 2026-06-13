package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestResolvePlannerSessionID_HeaderWinsOverCookie(t *testing.T) {
	t.Parallel()
	req := httptest.NewRequest("GET", "/api/v1/jobs", nil)
	req.AddCookie(&http.Cookie{Name: AppSessionCookieName, Value: "cookie-sess"})
	req.Header.Set(PlannerSessionIDHeader, "header-sess")
	got := ResolvePlannerSessionID(req)
	if got != "header-sess" {
		t.Fatalf("got %q, want header-sess", got)
	}
}

func TestResolvePlannerSessionID_QueryForWebSocket(t *testing.T) {
	t.Parallel()
	req := httptest.NewRequest("GET", "/ws?planner_session_id=ws-sess", nil)
	got := ResolvePlannerSessionID(req)
	if got != "ws-sess" {
		t.Fatalf("got %q, want ws-sess", got)
	}
}
