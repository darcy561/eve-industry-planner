package httpclient

import (
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestResponseJSON(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"name":"Jita","region":10000002}`))
	}))
	defer srv.Close()

	resp, err := newTestClient(t, srv, Config{}).Do(t.Context(), Request{Path: "/x"})
	if err != nil {
		t.Fatalf("Do: %v", err)
	}

	var out struct {
		Name   string `json:"name"`
		Region int    `json:"region"`
	}
	if err := resp.JSON(&out); err != nil {
		t.Fatalf("JSON: %v", err)
	}
	if out.Name != "Jita" || out.Region != 10000002 {
		t.Errorf("decoded %+v", out)
	}
}

func TestResponseJSONReportsStatusBeforeDecoding(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusForbidden)
		_, _ = w.Write([]byte(`{"error":"nope"}`))
	}))
	defer srv.Close()

	resp, err := newTestClient(t, srv, Config{}).Do(t.Context(), Request{Path: "/x"})
	if err != nil {
		t.Fatalf("Do: %v", err)
	}

	var out map[string]string
	statusErr, ok := errors.AsType[*StatusError](resp.JSON(&out))
	if !ok {
		t.Fatalf("JSON on a 403 should report the status, got %v", resp.JSON(&out))
	}
	if statusErr.Status != http.StatusForbidden {
		t.Errorf("Status = %d", statusErr.Status)
	}
}

func TestStreamJSONWalksElements(t *testing.T) {
	const count = 2500
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		var b strings.Builder
		b.WriteByte('[')
		for i := range count {
			if i > 0 {
				b.WriteByte(',')
			}
			fmt.Fprintf(&b, `{"order_id":%d}`, i)
		}
		b.WriteByte(']')
		_, _ = w.Write([]byte(b.String()))
	}))
	defer srv.Close()

	stream, err := newTestClient(t, srv, Config{}).Stream(t.Context(), Request{Path: "/x"})
	if err != nil {
		t.Fatalf("Stream: %v", err)
	}
	defer stream.Body.Close()

	type order struct {
		OrderID int `json:"order_id"`
	}
	seen := 0
	err = StreamJSON(stream.Body, func(o order) error {
		if o.OrderID != seen {
			return fmt.Errorf("out of order at %d: got %d", seen, o.OrderID)
		}
		seen++
		return nil
	})
	if err != nil {
		t.Fatalf("StreamJSON: %v", err)
	}
	if seen != count {
		t.Errorf("walked %d elements, want %d", seen, count)
	}
}

func TestStreamJSONStopsOnCallbackError(t *testing.T) {
	stop := errors.New("enough")
	seen := 0
	err := StreamJSON(strings.NewReader(`[1,2,3,4,5]`), func(int) error {
		seen++
		if seen == 2 {
			return stop
		}
		return nil
	})
	if !errors.Is(err, stop) {
		t.Fatalf("err = %v, want the callback's error", err)
	}
	if seen != 2 {
		t.Errorf("walked %d elements, want 2", seen)
	}
}

func TestStreamJSONRejectsNonArray(t *testing.T) {
	err := StreamJSON(strings.NewReader(`{"not":"an array"}`), func(int) error { return nil })
	if err == nil || !strings.Contains(err.Error(), "expected a json array") {
		t.Fatalf("err = %v", err)
	}
}

func TestFormBodySetsContentType(t *testing.T) {
	var got *http.Request
	var body string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = r.Clone(r.Context())
		_ = r.ParseForm()
		body = r.Form.Encode()
		_, _ = w.Write([]byte(`{}`))
	}))
	defer srv.Close()

	_, err := newTestClient(t, srv, Config{}).Do(t.Context(), Request{
		Method: http.MethodPost,
		Path:   "/token",
		Form:   url.Values{"grant_type": {"refresh_token"}, "refresh_token": {"abc"}},
		Header: http.Header{"Authorization": {"Basic xyz"}},
	})
	if err != nil {
		t.Fatalf("Do: %v", err)
	}
	if ct := got.Header.Get("Content-Type"); ct != "application/x-www-form-urlencoded" {
		t.Errorf("Content-Type = %q", ct)
	}
	if !strings.Contains(body, "grant_type=refresh_token") || !strings.Contains(body, "refresh_token=abc") {
		t.Errorf("form body = %q", body)
	}
	if got.Header.Get("Authorization") != "Basic xyz" {
		t.Errorf("Authorization dropped")
	}
}

func TestHostOverrideReachesTheWire(t *testing.T) {
	var seen string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen = r.Host
		_, _ = w.Write([]byte(`{}`))
	}))
	defer srv.Close()

	if _, err := newTestClient(t, srv, Config{}).
		Do(t.Context(), Request{Path: "/x", Host: "login.eveonline.com"}); err != nil {
		t.Fatalf("Do: %v", err)
	}
	if seen != "login.eveonline.com" {
		t.Errorf("Host = %q — setting it through Header would be ignored by net/http", seen)
	}
}

func TestRequestTimeoutBoundsOneAttempt(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-time.After(2 * time.Second):
			_, _ = w.Write([]byte(`{}`))
		case <-r.Context().Done():
		}
	}))
	defer srv.Close()

	start := time.Now()
	_, err := newTestClient(t, srv, Config{}).
		Do(t.Context(), Request{Path: "/x", Timeout: 60 * time.Millisecond})
	if err == nil {
		t.Fatal("expected the attempt to time out")
	}
	if elapsed := time.Since(start); elapsed > time.Second {
		t.Errorf("took %v, want the 60ms timeout to bite", elapsed)
	}
}

func TestOnCompleteSeesEveryAttempt(t *testing.T) {
	var calls int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls++
		if calls < 3 {
			w.WriteHeader(http.StatusBadGateway)
			return
		}
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer srv.Close()

	var mu sync.Mutex
	var seen []Attempt
	cfg := Config{OnComplete: func(a Attempt) {
		mu.Lock()
		defer mu.Unlock()
		seen = append(seen, a)
	}}

	if _, err := newTestClient(t, srv, cfg).
		Do(t.Context(), Request{Path: "/x", Retry: fastRetry(4)}); err != nil {
		t.Fatalf("Do: %v", err)
	}

	mu.Lock()
	defer mu.Unlock()
	if len(seen) != 3 {
		t.Fatalf("reported %d attempts, want 3", len(seen))
	}
	if seen[0].Status != http.StatusBadGateway || seen[2].Status != http.StatusOK {
		t.Errorf("statuses = %d, %d, %d", seen[0].Status, seen[1].Status, seen[2].Status)
	}
	if seen[2].Duration <= 0 || seen[2].Wire <= 0 {
		t.Errorf("attempt missing duration/wire: %+v", seen[2])
	}
}
