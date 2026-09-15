package planners

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"eve-industry-planner/shared/models"
	sessionreq "eve-industry-planner/shared/plannersession/request"
)

const settingsTestAccount = "acct-settings"

// The account's own handle needs no membership read, so these reach the handler
// body with no Mongo behind it — which is also what proves the refusals happen
// before anything is written.
func authenticatedSettingsRequest(body string) *http.Request {
	r := httptest.NewRequest(http.MethodPut,
		"/api/v1/planners/account:"+settingsTestAccount+"/settings", strings.NewReader(body))
	return r.WithContext(sessionreq.WithIdentity(r.Context(), settingsTestAccount, "sess-settings"))
}

func TestPutPlannerSettingsRefusesBeforeItWrites(t *testing.T) {
	t.Parallel()

	permanentDeleted := models.DefaultExtrasCategories()
	permanentDeleted[0].Deleted = true

	for _, tc := range []struct {
		name string
		body string
		want int
	}{
		{"a body that is not JSON", "{", http.StatusBadRequest},
		{"an update naming no setting", `{}`, http.StatusBadRequest},
		{"a category with no id", `{"extrasCategories":[{"id":"","label":"Courier"}]}`, http.StatusBadRequest},
		{"a category with no label", `{"extrasCategories":[{"id":"courier","label":"  "}]}`, http.StatusBadRequest},
		{
			"a list missing a permanent category",
			`{"extrasCategories":[{"id":"courier","label":"Courier"}]}`,
			http.StatusBadRequest,
		},
		{
			"a list repeating an id",
			`{"extrasCategories":[{"id":"0","label":"Unassigned"},{"id":"5","label":"Other"},{"id":"0","label":"Again"}]}`,
			http.StatusBadRequest,
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			h, _ := testHandlers(t)

			rec := httptest.NewRecorder()
			// A nil Mongo handle: reaching the write would panic rather than
			// answering, so a clean status is the assertion that it did not.
			h.PutPlannerSettingsHandler(rec, authenticatedSettingsRequest(tc.body),
				"account:"+settingsTestAccount)

			if rec.Code != tc.want {
				t.Fatalf("code = %d, want %d (body %s)", rec.Code, tc.want, rec.Body.String())
			}
		})
	}
}

// Nobody signed in is answered by the guard, before the body is read at all.
func TestPutPlannerSettingsRefusesWithoutAnAccount(t *testing.T) {
	t.Parallel()
	h, _ := testHandlers(t)

	rec := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodPut, "/api/v1/planners/account:a/settings",
		strings.NewReader(`{"extrasCategories":[]}`))
	h.PutPlannerSettingsHandler(rec, r, "account:a")

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("code = %d, want %d", rec.Code, http.StatusUnauthorized)
	}
	if strings.Contains(rec.Body.String(), "panic") {
		t.Fatal("the guard did not answer before touching Mongo")
	}
}

// A planner the account holds no membership row for is not found, rather than
// forbidden: a leaked id reveals only that it is not theirs.
func TestPutPlannerSettingsRefusesAnUnparseableHandle(t *testing.T) {
	t.Parallel()
	h, _ := testHandlers(t)

	rec := httptest.NewRecorder()
	h.PutPlannerSettingsHandler(rec, authenticatedSettingsRequest(`{"extrasCategories":[]}`),
		"nonsense")

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("code = %d, want %d", rec.Code, http.StatusBadRequest)
	}
}
