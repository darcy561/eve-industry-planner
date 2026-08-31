package statistics

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

// The router is the only thing that makes a handler reachable. A view that is
// written but unrouted returns 404 with no error anywhere to say the handler
// exists, so each path is pinned.
//
// Handlers with no Mongo answer 503, which is enough to prove the route reached
// them rather than falling through to the not-found branch.
func TestRouterReachesEachView(t *testing.T) {
	t.Parallel()

	h := New(nil)

	cases := []struct {
		path string
		want int
	}{
		{"/api/v1/statistics/account/timeline", http.StatusServiceUnavailable},
		{"/api/v1/statistics/account/timeline/", http.StatusServiceUnavailable},
		{"/api/v1/statistics/account/timeline/items", http.StatusServiceUnavailable},
		{"/api/v1/statistics/account/timeline/items/", http.StatusServiceUnavailable},
		{"/api/v1/statistics/account/totals", http.StatusServiceUnavailable},
		{"/api/v1/statistics/account/totals/", http.StatusServiceUnavailable},
	}

	for _, tc := range cases {
		t.Run(tc.path, func(t *testing.T) {
			t.Parallel()
			rec := httptest.NewRecorder()
			h.Router(rec, httptest.NewRequest(http.MethodGet, tc.path, nil))
			if rec.Code != tc.want {
				t.Fatalf("%s = %d, want %d — the route did not reach its handler", tc.path, rec.Code, tc.want)
			}
		})
	}
}

func TestRouterRejectsUnknownViews(t *testing.T) {
	t.Parallel()

	h := New(nil)

	cases := []string{
		"/api/v1/statistics",
		"/api/v1/statistics/",
		"/api/v1/statistics/account",
		"/api/v1/statistics/account/",
		"/api/v1/statistics/account/rollups",
		// Pinned as absent so it is not revived by accident.
		"/api/v1/statistics/build-stats",
		"/api/v1/statistics/account/timeline/items/extra",
		// Corporation scope is Stage C; naming it must not fall through to an
		// account view and read the caller's own data under a corporation path.
		"/api/v1/statistics/corporation/corp_abc/timeline",
	}

	for _, path := range cases {
		t.Run(path, func(t *testing.T) {
			t.Parallel()
			rec := httptest.NewRecorder()
			h.Router(rec, httptest.NewRequest(http.MethodGet, path, nil))
			if rec.Code != http.StatusNotFound {
				t.Fatalf("%s = %d, want 404", path, rec.Code)
			}
		})
	}
}

// A write to a read-only view is a 405 rather than a 404, so a caller can tell
// a wrong method from a wrong path.
func TestTimelineViewsRejectNonGET(t *testing.T) {
	t.Parallel()

	h := New(nil)

	for _, path := range []string{
		"/api/v1/statistics/account/timeline",
		"/api/v1/statistics/account/timeline/items",
		"/api/v1/statistics/account/totals",
	} {
		for _, method := range []string{http.MethodPost, http.MethodPut, http.MethodDelete} {
			rec := httptest.NewRecorder()
			h.Router(rec, httptest.NewRequest(method, path, nil))
			if rec.Code != http.StatusMethodNotAllowed {
				t.Fatalf("%s %s = %d, want 405", method, path, rec.Code)
			}
		}
	}
}
