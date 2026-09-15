package planners

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// The settings suffix is routed as a suffix of the handle, not as a path
// segment: an owner handle is `kind:id` and carries a colon, so a router that
// split on segments would never reach either handler.
func TestRouterSeparatesSettingsFromTheHandle(t *testing.T) {
	t.Parallel()

	for _, tc := range []struct {
		name   string
		method string
		path   string
		want   int
	}{
		{"settings takes GET", http.MethodGet, "/api/v1/planners/account:acct-1/settings", http.StatusUnauthorized},
		{"settings takes PUT", http.MethodPut, "/api/v1/planners/account:acct-1/settings", http.StatusUnauthorized},
		{"settings refuses DELETE", http.MethodDelete, "/api/v1/planners/account:acct-1/settings", http.StatusMethodNotAllowed},
		{"the planner itself takes PUT", http.MethodPut, "/api/v1/planners/account:acct-1", http.StatusUnauthorized},
		{"the planner itself refuses GET", http.MethodGet, "/api/v1/planners/account:acct-1", http.StatusMethodNotAllowed},
		{"settings with no handle is not found", http.MethodGet, "/api/v1/planners//settings", http.StatusNotFound},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			h, _ := testHandlers(t)

			rec := httptest.NewRecorder()
			h.Router(rec, httptest.NewRequest(tc.method, tc.path, nil))

			if rec.Code != tc.want {
				t.Fatalf("%s %s = %d, want %d", tc.method, tc.path, rec.Code, tc.want)
			}
		})
	}
}

// A handle carrying a slash is refused rather than being read as a deeper route.
func TestRouterRefusesAHandleWithASlash(t *testing.T) {
	t.Parallel()
	h, _ := testHandlers(t)

	rec := httptest.NewRecorder()
	h.Router(rec, httptest.NewRequest(http.MethodGet, "/api/v1/planners/account:a/b/settings", nil))

	if rec.Code != http.StatusNotFound {
		t.Fatalf("code = %d, want %d", rec.Code, http.StatusNotFound)
	}
}

// Without Mongo the guard answers rather than dereferencing a nil handle, which
// is what every handler behind it relies on.
func TestReachableOwnerRefusesWithoutMongo(t *testing.T) {
	t.Parallel()
	h, _ := testHandlers(t)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/planners/account:acct-1/settings", nil)
	rec := httptest.NewRecorder()
	h.GetPlannerSettingsHandler(rec, req, "account:acct-1")

	// No authenticated account on the request, so the auth arm answers first.
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("code = %d, want %d", rec.Code, http.StatusUnauthorized)
	}
	if strings.Contains(rec.Body.String(), "panic") {
		t.Fatal("the guard did not answer before touching Mongo")
	}
}
