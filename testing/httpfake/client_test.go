package httpfake_test

import (
	"net/http"
	"testing"

	"eve-industry-planner/shared/httpclient"
	"eve-industry-planner/testing/httpfake"
)

func TestConfigWiresAClientToTheFake(t *testing.T) {
	fake := httpfake.New(t)
	fake.SetJSON(http.MethodGet, "/status/", http.StatusOK, `{"players":30000}`)

	client := httpclient.New(fake.Config())
	resp, err := client.Do(t.Context(), httpclient.Request{Path: "/status/"})
	if err != nil {
		t.Fatalf("Do: %v", err)
	}

	var out struct {
		Players int `json:"players"`
	}
	if err := resp.JSON(&out); err != nil {
		t.Fatalf("JSON: %v", err)
	}
	if out.Players != 30000 {
		t.Errorf("players = %d", out.Players)
	}
	if calls := fake.CallsTo(http.MethodGet, "/status/"); len(calls) != 1 {
		t.Errorf("recorded %d calls, want 1", len(calls))
	}
}

func TestQueueDrivesRetriesWithoutCounters(t *testing.T) {
	fake := httpfake.New(t)
	fake.Queue(http.MethodGet, "/x",
		httpfake.Response{Status: http.StatusBadGateway},
		httpfake.Response{Status: http.StatusBadGateway},
		httpfake.Response{Status: http.StatusOK, Body: `{"ok":true}`},
	)

	client := fake.NewClient()
	resp, err := client.Do(t.Context(), httpclient.Request{
		Path:  "/x",
		Retry: httpclient.DefaultRetry(),
	})
	if err != nil {
		t.Fatalf("Do: %v", err)
	}
	if resp.Status != http.StatusOK {
		t.Errorf("Status = %d", resp.Status)
	}
	if calls := fake.CallsTo(http.MethodGet, "/x"); len(calls) != 3 {
		t.Errorf("recorded %d calls, want 3", len(calls))
	}
}

func TestNewClientAdjustsConfig(t *testing.T) {
	fake := httpfake.New(t)
	fake.SetJSON(http.MethodGet, "/x", http.StatusOK, `{}`)

	client := fake.NewClient(func(c *httpclient.Config) {
		c.UserAgent = "harness-agent"
	})
	if _, err := client.Do(t.Context(), httpclient.Request{Path: "/x"}); err != nil {
		t.Fatalf("Do: %v", err)
	}

	call, ok := fake.Last(http.MethodGet, "/x")
	if !ok {
		t.Fatal("no call recorded")
	}
	if got := call.Header.Get("User-Agent"); got != "harness-agent" {
		t.Errorf("User-Agent = %q", got)
	}
}
