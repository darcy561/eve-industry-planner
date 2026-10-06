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
		{"an unknown compressed ore choice",
			`{"reprocessingSettings":{"compressedOre":"always","shipping":{"mode":"perVolume"},"neverChoose":[]}}`,
			http.StatusBadRequest},
		{"a negative shipping amount",
			`{"reprocessingSettings":{"compressedOre":"prefer","shipping":{"mode":"fixed","amount":-5},"neverChoose":[]}}`,
			http.StatusBadRequest},
		{"a never-choose list holding a name",
			`{"reprocessingSettings":{"compressedOre":"prefer","shipping":{"mode":"perVolume"},"neverChoose":["Veldspar"]}}`,
			http.StatusBadRequest},
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
			h.PutPlannerSettingsHandler(rec, authenticatedSettingsRequest(tc.body),
				"account:"+settingsTestAccount)

			if rec.Code != tc.want {
				t.Fatalf("code = %d, want %d (body %s)", rec.Code, tc.want, rec.Body.String())
			}
		})
	}
}

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
