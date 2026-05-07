package statistics

import (
	"net/http/httptest"
	"testing"
)

func TestParseCorpTypeQuery(t *testing.T) {
	req := httptest.NewRequest("GET", "/api/v1/statistics/corp-build-stats?corporation_id=123&typeID=456", nil)
	corpID, typeID, err := parseCorpTypeQuery(req)
	if err != nil {
		t.Fatalf("parseCorpTypeQuery returned error: %v", err)
	}
	if corpID != 123 || typeID != 456 {
		t.Fatalf("unexpected parse result corpID=%d typeID=%d", corpID, typeID)
	}
}

func TestParseCorpTypeQuery_RejectsInvalid(t *testing.T) {
	tests := []string{
		"/api/v1/statistics/corp-build-stats?typeID=1",
		"/api/v1/statistics/corp-build-stats?corporation_id=1",
		"/api/v1/statistics/corp-build-stats?corporation_id=abc&typeID=1",
		"/api/v1/statistics/corp-build-stats?corporation_id=1&typeID=-1",
	}
	for _, url := range tests {
		req := httptest.NewRequest("GET", url, nil)
		if _, _, err := parseCorpTypeQuery(req); err == nil {
			t.Fatalf("expected parseCorpTypeQuery to fail for %q", url)
		}
	}
}

func TestCorpInClaims(t *testing.T) {
	if !corpInClaims(10, []int64{1, 10, 20}) {
		t.Fatal("expected corpInClaims to return true")
	}
	if corpInClaims(11, []int64{1, 10, 20}) {
		t.Fatal("expected corpInClaims to return false")
	}
}
