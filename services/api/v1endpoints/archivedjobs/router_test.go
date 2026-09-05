package archivedjobs

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

// routeStatus drives the router with no Mongo: a dispatched route answers 503,
// which distinguishes it from one that was refused.
func routeStatus(t *testing.T, method, path string) int {
	t.Helper()
	h := New(nil)
	rec := httptest.NewRecorder()
	h.Router(rec, httptest.NewRequest(method, path, nil))
	return rec.Code
}

// GET reaches the list rather than the 405 of the upsert-only route.
func TestGetCollectionReachesTheList(t *testing.T) {
	for _, path := range []string{"/api/v1/archived-jobs", "/api/v1/archived-jobs/"} {
		if got := routeStatus(t, http.MethodGet, path); got != http.StatusServiceUnavailable {
			t.Fatalf("GET %s = %d, want the handler to dispatch (503 without Mongo)", path, got)
		}
	}
}

// A job id addresses one document.
func TestGetJobReachesTheSingleRead(t *testing.T) {
	if got := routeStatus(t, http.MethodGet, "/api/v1/archived-jobs/job-1"); got != http.StatusServiceUnavailable {
		t.Fatalf("GET one job = %d, want the handler to dispatch (503 without Mongo)", got)
	}
}

// A client must not delete or create through a read-and-upsert route.
func TestUnsupportedMethodsAreRefused(t *testing.T) {
	cases := []struct {
		method string
		path   string
	}{
		{http.MethodDelete, "/api/v1/archived-jobs"},
		{http.MethodPost, "/api/v1/archived-jobs"},
		{http.MethodPatch, "/api/v1/archived-jobs"},
		{http.MethodPut, "/api/v1/archived-jobs/job-1"},
		{http.MethodDelete, "/api/v1/archived-jobs/job-1"},
	}
	for _, tc := range cases {
		if got := routeStatus(t, tc.method, tc.path); got != http.StatusMethodNotAllowed {
			t.Fatalf("%s %s = %d, want 405", tc.method, tc.path, got)
		}
	}
}

// The three restore shapes each reach the handler.
func TestRestoreRoutesDispatch(t *testing.T) {
	for _, path := range []string{
		"/api/v1/archived-jobs/job-1/restore",
		"/api/v1/archived-jobs/groups/group-1/restore",
		"/api/v1/archived-jobs/related/job-1/restore",
	} {
		if got := routeStatus(t, http.MethodPost, path); got != http.StatusServiceUnavailable {
			t.Fatalf("POST %s = %d, want the handler to dispatch (503 without Mongo)", path, got)
		}
	}
}

// Restore mutates, so a navigation or prefetch must not reach it.
func TestRestoreRoutesRefuseNonPost(t *testing.T) {
	for _, method := range []string{http.MethodGet, http.MethodPut, http.MethodDelete} {
		if got := routeStatus(t, method, "/api/v1/archived-jobs/job-1/restore"); got != http.StatusMethodNotAllowed {
			t.Fatalf("%s restore = %d, want 405", method, got)
		}
	}
}

// A mistyped call must fail rather than falling through to a job id.
func TestUnknownDeeperPathsAreNotFound(t *testing.T) {
	for _, path := range []string{
		"/api/v1/archived-jobs/groups/group-1",
		"/api/v1/archived-jobs/job-1/unarchive",
		"/api/v1/archived-jobs/related/job-1",
		"/api/v1/archived-jobs/groups//restore",
		"/api/v1/archived-jobs/a/b/c/d",
	} {
		if got := routeStatus(t, http.MethodPost, path); got != http.StatusNotFound {
			t.Fatalf("POST %s = %d, want 404", path, got)
		}
	}
}
