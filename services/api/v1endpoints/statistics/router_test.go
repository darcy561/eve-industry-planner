package statistics

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"eve-industry-planner/api/helper/auth"
)

const routerAccount = "acct-router"

// A request as the auth middleware leaves it, naming the session's own owner.
func signedIn(path string) *http.Request {
	r := httptest.NewRequest(http.MethodGet, path, nil)
	return r.WithContext(auth.WithAuthIdentity(r.Context(), routerAccount, "sess-router"))
}

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
		{"/api/v1/statistics/account:" + routerAccount + "/timeline", http.StatusServiceUnavailable},
		{"/api/v1/statistics/account:" + routerAccount + "/timeline/", http.StatusServiceUnavailable},
		{"/api/v1/statistics/account:" + routerAccount + "/timeline/items", http.StatusServiceUnavailable},
		{"/api/v1/statistics/account:" + routerAccount + "/timeline/items/", http.StatusServiceUnavailable},
		{"/api/v1/statistics/account:" + routerAccount + "/totals", http.StatusServiceUnavailable},
		{"/api/v1/statistics/account:" + routerAccount + "/totals/", http.StatusServiceUnavailable},
	}

	for _, tc := range cases {
		t.Run(tc.path, func(t *testing.T) {
			t.Parallel()
			rec := httptest.NewRecorder()
			h.Router(rec, signedIn(tc.path))
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
		"/api/v1/statistics/account:" + routerAccount + "/rollups",
		// A handle with no kind is unreadable rather than an account.
		"/api/v1/statistics/" + routerAccount + "/timeline",
		"/api/v1/statistics/account:/timeline",
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
		"/api/v1/statistics/account:" + routerAccount + "/timeline",
		"/api/v1/statistics/account:" + routerAccount + "/timeline/items",
		"/api/v1/statistics/account:" + routerAccount + "/totals",
	} {
		for _, method := range []string{http.MethodPost, http.MethodPut, http.MethodDelete} {
			rec := httptest.NewRecorder()
			r := httptest.NewRequest(method, path, nil)
			h.Router(rec, r.WithContext(auth.WithAuthIdentity(r.Context(), routerAccount, "sess-router")))
			if rec.Code != http.StatusMethodNotAllowed {
				t.Fatalf("%s %s = %d, want 405", method, path, rec.Code)
			}
		}
	}
}

// The path names an owner, so it has to be checked against the session rather
// than trusted: without this a caller could read another account's statistics by
// changing one segment.
func TestViewsRefuseAnOwnerTheSessionDoesNotHold(t *testing.T) {
	t.Parallel()

	h := New(nil)

	for _, path := range []string{
		"/api/v1/statistics/account:someone-else/timeline",
		"/api/v1/statistics/account:someone-else/timeline/items",
		"/api/v1/statistics/account:someone-else/totals",
		// A kind that is routed but not served yet must be refused, not treated
		// as the caller's own account.
		"/api/v1/statistics/corporation:98000001/timeline",
		"/api/v1/statistics/planner:01J0/timeline",
	} {
		t.Run(path, func(t *testing.T) {
			t.Parallel()
			rec := httptest.NewRecorder()
			h.Router(rec, signedIn(path))
			if rec.Code != http.StatusForbidden {
				t.Fatalf("%s = %d, want 403", path, rec.Code)
			}
		})
	}
}
