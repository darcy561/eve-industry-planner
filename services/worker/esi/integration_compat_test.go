package esi

import (
	"bytes"
	"io"
	"net/http"
	"os"
	"testing"
	"time"
)

// pastCompatibilityDate is an intentionally old date (minimum supported window) to verify
// X-Compatibility-Date is honoured; ESI typically echoes it on the response.
// Live pin for normal clients: worker/esi.CompatibilityDate and frontend GLOBAL_CONFIG.ESI_COMPATIBILITY_DATE.
const pastCompatibilityDate = "2020-01-01"

// TestIntegration_ESIPastCompatibilityDate exercises live esi.evetech.net with
// X-Compatibility-Date in the past. Run with:
//
//	EVE_ESI_INTEGRATION=1 go test ./worker/esi/ -run TestIntegration_ESIPastCompatibilityDate -v
func TestIntegration_ESIPastCompatibilityDate(t *testing.T) {
	if os.Getenv("EVE_ESI_INTEGRATION") == "" {
		t.Skip("set EVE_ESI_INTEGRATION=1 to run live ESI compatibility checks (network)")
	}

	client := &http.Client{Timeout: 20 * time.Second}

	t.Run("GET_status", func(t *testing.T) {
		req, err := http.NewRequest(http.MethodGet, "https://esi.evetech.net/status/?datasource=tranquility", nil)
		if err != nil {
			t.Fatal(err)
		}
		req.Header.Set("X-Compatibility-Date", pastCompatibilityDate)

		resp, err := client.Do(req)
		if err != nil {
			t.Fatalf("request: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			b, _ := io.ReadAll(resp.Body)
			t.Fatalf("status=%d body=%s", resp.StatusCode, b)
		}
		if got := resp.Header.Get("X-Compatibility-Date"); got == "" {
			t.Fatal("expected X-Compatibility-Date response header")
		} else {
			t.Logf("response X-Compatibility-Date=%q (request was %q)", got, pastCompatibilityDate)
		}
	})

	t.Run("POST_characters_affiliation", func(t *testing.T) {
		body := bytes.NewReader([]byte(`[2112628298]`))
		req, err := http.NewRequest(http.MethodPost, "https://esi.evetech.net/characters/affiliation/?datasource=tranquility", body)
		if err != nil {
			t.Fatal(err)
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Compatibility-Date", pastCompatibilityDate)

		resp, err := client.Do(req)
		if err != nil {
			t.Fatalf("request: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			b, _ := io.ReadAll(resp.Body)
			t.Fatalf("status=%d body=%s", resp.StatusCode, b)
		}
		if got := resp.Header.Get("X-Compatibility-Date"); got == "" {
			t.Fatal("expected X-Compatibility-Date response header")
		} else {
			t.Logf("response X-Compatibility-Date=%q (request was %q)", got, pastCompatibilityDate)
		}
	})
}
