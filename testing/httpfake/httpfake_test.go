package httpfake_test

import (
	"io"
	"net/http"
	"strings"
	"testing"
	"testing/synctest"
	"time"

	"eve-industry-planner/testing/httpfake"
)

func get(t *testing.T, f *httpfake.Server, path string) (int, string) {
	t.Helper()
	resp, err := f.Client().Get(f.BaseURL() + path)
	if err != nil {
		t.Fatalf("get %s: %v", path, err)
	}
	defer resp.Body.Close()
	b, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	return resp.StatusCode, string(b)
}

func TestSet_repeatsAndRecords(t *testing.T) {
	f := httpfake.New(t)
	f.SetJSON(http.MethodGet, "/status", http.StatusOK, `{"ok":true}`)

	for range 3 {
		status, body := get(t, f, "/status?page=2")
		if status != http.StatusOK || body != `{"ok":true}` {
			t.Fatalf("got %d %q", status, body)
		}
	}

	calls := f.CallsTo(http.MethodGet, "/status")
	if len(calls) != 3 {
		t.Fatalf("recorded %d calls, want 3", len(calls))
	}
	if got := calls[0].Query.Get("page"); got != "2" {
		t.Fatalf("query page=%q, want 2", got)
	}
}

func TestQueue_drainsThenRepeatsLast(t *testing.T) {
	f := httpfake.New(t)
	f.Queue(http.MethodGet, "/count",
		httpfake.Response{Body: "1"},
		httpfake.Response{Body: "2"},
		httpfake.Response{Body: "3"},
	)

	var got []string
	for range 5 {
		_, body := get(t, f, "/count")
		got = append(got, body)
	}
	if want := "1,2,3,3,3"; strings.Join(got, ",") != want {
		t.Fatalf("got %v, want %s", got, want)
	}
}

func TestUnroutedRequestIsLoud(t *testing.T) {
	f := httpfake.New(t)
	status, body := get(t, f, "/nope")
	if status != http.StatusNotImplemented {
		t.Fatalf("status %d, want 501", status)
	}
	if !strings.Contains(body, "GET /nope") {
		t.Fatalf("body %q does not name the route", body)
	}
	if len(f.Calls()) != 1 {
		t.Fatal("unrouted request was not recorded")
	}
}

func TestRewritePath_stripsVersionPrefix(t *testing.T) {
	f := httpfake.New(t)
	f.RewritePath = func(p string) string {
		if rest, ok := strings.CutPrefix(p, "/v1"); ok {
			return rest
		}
		return p
	}
	f.Set(http.MethodGet, "/markets", httpfake.Response{Body: "ok"})

	if _, body := get(t, f, "/v1/markets"); body != "ok" {
		t.Fatalf("body %q", body)
	}
}

func TestHandle_takesPrecedence(t *testing.T) {
	f := httpfake.New(t)
	f.Set(http.MethodGet, "/hdr", httpfake.Response{Body: "canned"})
	f.Handle(http.MethodGet, "/hdr", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("X-Ratelimit-Remaining", "38")
		_, _ = io.WriteString(w, "handled")
	})

	resp, err := f.Client().Get(f.BaseURL() + "/hdr")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if got := resp.Header.Get("X-Ratelimit-Remaining"); got != "38" {
		t.Fatalf("header %q, want 38", got)
	}
	b, _ := io.ReadAll(resp.Body)
	if string(b) != "handled" {
		t.Fatalf("body %q", b)
	}
}

// The reason this package exists: a caller that polls the dependency on a timer
// runs to completion on simulated time, with no wall clock spent.
func TestPollingCallerUnderSynctest(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		f := httpfake.New(t)
		f.Queue(http.MethodGet, "/ready",
			httpfake.Response{Status: http.StatusServiceUnavailable, Body: "starting"},
			httpfake.Response{Status: http.StatusServiceUnavailable, Body: "starting"},
			httpfake.Response{Status: http.StatusOK, Body: "ready"},
		)

		start := time.Now()
		attempts := 0
		for {
			attempts++
			resp, err := f.Client().Get(f.BaseURL() + "/ready")
			if err != nil {
				t.Fatalf("attempt %d: %v", attempts, err)
			}
			resp.Body.Close()
			if resp.StatusCode == http.StatusOK {
				break
			}
			time.Sleep(30 * time.Second)
		}
		if attempts != 3 {
			t.Fatalf("attempts=%d, want 3", attempts)
		}
		if elapsed := time.Since(start); elapsed != time.Minute {
			t.Fatalf("simulated elapsed %v, want 1m", elapsed)
		}
	})
}
