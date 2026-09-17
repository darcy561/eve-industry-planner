package archivedjobs

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"eve-industry-planner/api/helper"
)

// Absent leaves the month alone, null returns it to what the reduction derives,
// and a value sets it. A decoder collapsing absent into null undoes a filing.
func TestFilingRequestKeepsAbsentApartFromNull(t *testing.T) {
	t.Parallel()

	for _, tc := range []struct {
		name      string
		body      string
		wantNil   bool
		wantBytes string
	}{
		{"absent", `{}`, true, ""},
		{"null", `{"costMonth":null}`, false, "null"},
		{"value", `{"costMonth":"2025-03"}`, false, `"2025-03"`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			var req filingRequest
			r := httptest.NewRequest(http.MethodPatch, "/", strings.NewReader(tc.body))
			if err := helper.DecodeJSONRequest(r, &req, helper.DefaultMaxBodySize); err != nil {
				t.Fatal(err)
			}
			if (req.CostMonth == nil) != tc.wantNil {
				t.Fatalf("CostMonth nil = %v, want %v", req.CostMonth == nil, tc.wantNil)
			}
			if string(req.CostMonth) != tc.wantBytes {
				t.Fatalf("CostMonth = %q, want %q", req.CostMonth, tc.wantBytes)
			}
		})
	}
}

func TestFilingRequestRefusesAnUndeclaredField(t *testing.T) {
	t.Parallel()
	var req filingRequest
	r := httptest.NewRequest(http.MethodPatch, "/", strings.NewReader(`{"costMonth":"2025-03","nope":1}`))
	if err := helper.DecodeJSONRequest(r, &req, helper.DefaultMaxBodySize); err == nil {
		t.Fatal("an undeclared field must refuse")
	}
}
