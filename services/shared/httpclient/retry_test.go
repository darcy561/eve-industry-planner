package httpclient

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func fastRetry(attempts int) Retry {
	return Retry{
		Attempts:  attempts,
		BaseDelay: time.Millisecond,
		MaxDelay:  2 * time.Millisecond,
	}
}

// recordingGate stands in for a rate limiter: it counts admissions and
// settlements so a test can prove each attempt paid its own way.
type recordingGate struct {
	mu       sync.Mutex
	admits   int
	settles  int
	statuses []int
	refuse   error
}

func (g *recordingGate) Admit(context.Context, *Request) (Ticket, error) {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.refuse != nil {
		return nil, g.refuse
	}
	g.admits++
	return g.admits, nil
}

func (g *recordingGate) Settle(_ context.Context, _ Ticket, resp *Response, _ error) {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.settles++
	if resp != nil {
		g.statuses = append(g.statuses, resp.Status)
	}
}

func (g *recordingGate) counts() (int, int) {
	g.mu.Lock()
	defer g.mu.Unlock()
	return g.admits, g.settles
}

func TestEveryRetriedAttemptIsAdmittedAndSettled(t *testing.T) {
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		if calls.Add(1) < 3 {
			w.WriteHeader(http.StatusBadGateway)
			return
		}
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer srv.Close()

	gate := &recordingGate{}
	client := newTestClient(t, srv, Config{Gate: gate})

	resp, err := client.Do(t.Context(), Request{Path: "/x", Retry: fastRetry(4)})
	if err != nil {
		t.Fatalf("Do: %v", err)
	}
	if resp.Status != http.StatusOK {
		t.Errorf("Status = %d", resp.Status)
	}

	admits, settles := gate.counts()
	if got := calls.Load(); got != 3 {
		t.Fatalf("requests = %d, want 3", got)
	}
	if admits != 3 {
		t.Errorf("admits = %d, want 3 — a retried request must reserve its own budget", admits)
	}
	if settles != 3 {
		t.Errorf("settles = %d, want 3 — every admission must be reconciled", settles)
	}
	if len(gate.statuses) != 3 || gate.statuses[2] != http.StatusOK {
		t.Errorf("settled statuses = %v, want [502 502 200]", gate.statuses)
	}
}

func TestGateRefusalIsNotRetried(t *testing.T) {
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls.Add(1)
		w.WriteHeader(http.StatusBadGateway)
	}))
	defer srv.Close()

	refusal := errors.New("come back at 10:31")
	gate := &recordingGate{refuse: refusal}
	client := newTestClient(t, srv, Config{Gate: gate})

	_, err := client.Do(t.Context(), Request{Path: "/x", Retry: fastRetry(4)})
	if !errors.Is(err, refusal) {
		t.Fatalf("err = %v, want the gate's refusal", err)
	}
	if got := calls.Load(); got != 0 {
		t.Errorf("requests = %d, want 0 — a refused call never reaches the network", got)
	}
	if _, settles := gate.counts(); settles != 0 {
		t.Errorf("settles = %d, want 0 — nothing was admitted", settles)
	}
}

func TestZeroRetrySendsOnce(t *testing.T) {
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls.Add(1)
		w.WriteHeader(http.StatusBadGateway)
	}))
	defer srv.Close()

	resp, err := newTestClient(t, srv, Config{}).Do(t.Context(), Request{Path: "/x"})
	if err != nil {
		t.Fatalf("Do: %v", err)
	}
	if resp.Status != http.StatusBadGateway {
		t.Errorf("Status = %d", resp.Status)
	}
	if got := calls.Load(); got != 1 {
		t.Errorf("requests = %d, want 1 for the zero Retry", got)
	}
}

func TestClientErrorsAndRateLimitsAreNotRepeated(t *testing.T) {
	for _, status := range []int{http.StatusNotFound, http.StatusUnprocessableEntity, http.StatusTooManyRequests} {
		t.Run(http.StatusText(status), func(t *testing.T) {
			var calls atomic.Int32
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				calls.Add(1)
				w.Header().Set("Retry-After", "1")
				w.WriteHeader(status)
			}))
			defer srv.Close()

			resp, err := newTestClient(t, srv, Config{}).
				Do(t.Context(), Request{Path: "/x", Retry: fastRetry(4)})
			if err != nil {
				t.Fatalf("status should come back as data: %v", err)
			}
			if resp.Status != status {
				t.Errorf("Status = %d", resp.Status)
			}
			if got := calls.Load(); got != 1 {
				t.Errorf("requests = %d, want 1", got)
			}
		})
	}
}

func TestNotImplementedIsNotRepeated(t *testing.T) {
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls.Add(1)
		w.WriteHeader(http.StatusNotImplemented)
	}))
	defer srv.Close()

	if _, err := newTestClient(t, srv, Config{}).
		Do(t.Context(), Request{Path: "/x", Retry: fastRetry(4)}); err != nil {
		t.Fatalf("Do: %v", err)
	}
	if got := calls.Load(); got != 1 {
		t.Errorf("requests = %d, want 1 — 501 will not become implemented", got)
	}
}

func TestPostNeedsNonIdempotentOptIn(t *testing.T) {
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls.Add(1)
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer srv.Close()

	client := newTestClient(t, srv, Config{})
	req := Request{Method: http.MethodPost, Path: "/x", Body: []byte(`[1]`), Retry: fastRetry(3)}

	if _, err := client.Do(t.Context(), req); err != nil {
		t.Fatalf("Do: %v", err)
	}
	if got := calls.Load(); got != 1 {
		t.Errorf("requests = %d, want 1 for an unflagged POST", got)
	}

	calls.Store(0)
	req.Retry.NonIdempotent = true
	if _, err := client.Do(t.Context(), req); err != nil {
		t.Fatalf("Do: %v", err)
	}
	if got := calls.Load(); got != 3 {
		t.Errorf("requests = %d, want 3 once flagged", got)
	}
}

func TestStatedRetryAfterIsCappedByMaxDelay(t *testing.T) {
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		if calls.Add(1) < 2 {
			w.Header().Set("Retry-After", "30")
			w.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		_, _ = w.Write([]byte(`{}`))
	}))
	defer srv.Close()

	policy := Retry{Attempts: 2, BaseDelay: time.Millisecond, MaxDelay: 20 * time.Millisecond}

	start := time.Now()
	resp, err := newTestClient(t, srv, Config{}).Do(t.Context(), Request{Path: "/x", Retry: policy})
	if err != nil {
		t.Fatalf("Do: %v", err)
	}
	if resp.Status != http.StatusOK {
		t.Errorf("Status = %d", resp.Status)
	}
	if elapsed := time.Since(start); elapsed > time.Second {
		t.Errorf("waited %v — MaxDelay should cap a stated Retry-After", elapsed)
	}
}

func TestRetryAfterParsing(t *testing.T) {
	cases := []struct {
		name   string
		header string
		want   time.Duration
		ok     bool
	}{
		{name: "seconds", header: "5", want: 5 * time.Second, ok: true},
		{name: "http date", header: time.Now().Add(3 * time.Second).UTC().Format(http.TimeFormat), want: time.Second, ok: true},
		{name: "past date", header: time.Now().Add(-time.Hour).UTC().Format(http.TimeFormat), want: 0, ok: true},
		{name: "negative", header: "-5", ok: false},
		{name: "absent", header: "", ok: false},
		{name: "nonsense", header: "soon", ok: false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			header := http.Header{}
			if tc.header != "" {
				header.Set("Retry-After", tc.header)
			}
			got, ok := retryAfter(header)
			if ok != tc.ok {
				t.Fatalf("ok = %v, want %v", ok, tc.ok)
			}
			if ok && got < tc.want {
				t.Errorf("delay = %v, want at least %v", got, tc.want)
			}
		})
	}
}

func TestRetryStopsRatherThanSleepPastDeadline(t *testing.T) {
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls.Add(1)
		w.WriteHeader(http.StatusBadGateway)
	}))
	defer srv.Close()

	ctx, cancel := context.WithTimeout(t.Context(), 40*time.Millisecond)
	defer cancel()

	resp, err := newTestClient(t, srv, Config{}).Do(ctx, Request{
		Path:  "/x",
		Retry: Retry{Attempts: 5, BaseDelay: 500 * time.Millisecond, MaxDelay: time.Second},
	})
	if err != nil {
		t.Fatalf("the last response should be returned, not a context error: %v", err)
	}
	if resp.Status != http.StatusBadGateway {
		t.Errorf("Status = %d", resp.Status)
	}
	if got := calls.Load(); got != 1 {
		t.Errorf("requests = %d, want 1 — the backoff exceeded the remaining budget", got)
	}
}

func TestTransportFailuresAreRepeated(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	closed := srv.URL
	srv.Close()

	gate := &recordingGate{}
	client := New(Config{BaseURL: closed, Gate: gate})

	if _, err := client.Do(t.Context(), Request{Path: "/x", Retry: fastRetry(3)}); err == nil {
		t.Fatal("expected a dial failure")
	}
	admits, settles := gate.counts()
	if admits != 3 || settles != 3 {
		t.Errorf("admits/settles = %d/%d, want 3/3 — a failed attempt is still an attempt", admits, settles)
	}
}

func TestCustomRepeatStatus(t *testing.T) {
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls.Add(1)
		w.WriteHeader(http.StatusConflict)
	}))
	defer srv.Close()

	policy := fastRetry(3)
	policy.RepeatStatus = func(status int) bool { return status == http.StatusConflict }

	if _, err := newTestClient(t, srv, Config{}).
		Do(t.Context(), Request{Path: "/x", Retry: policy}); err != nil {
		t.Fatalf("Do: %v", err)
	}
	if got := calls.Load(); got != 3 {
		t.Errorf("requests = %d, want 3", got)
	}
}

func TestStreamRetriesHeaderPhaseAndClosesDiscardedBodies(t *testing.T) {
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		if calls.Add(1) < 2 {
			w.WriteHeader(http.StatusInternalServerError)
			_, _ = w.Write([]byte("discard me"))
			return
		}
		_, _ = w.Write([]byte("row\nrow\n"))
	}))
	defer srv.Close()

	gate := &recordingGate{}
	stream, err := newTestClient(t, srv, Config{Gate: gate}).
		Stream(t.Context(), Request{Path: "/x", Retry: fastRetry(3)})
	if err != nil {
		t.Fatalf("Stream: %v", err)
	}
	defer stream.Body.Close()

	body, err := io.ReadAll(stream.Body)
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	if string(body) != "row\nrow\n" {
		t.Errorf("body = %q", body)
	}
	if got := calls.Load(); got != 2 {
		t.Errorf("requests = %d, want 2", got)
	}
	if admits, settles := gate.counts(); admits != 2 || settles != 2 {
		t.Errorf("admits/settles = %d/%d, want 2/2", admits, settles)
	}
}

func TestNoGateIsFine(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{}`))
	}))
	defer srv.Close()

	if _, err := newTestClient(t, srv, Config{}).Do(t.Context(), Request{Path: "/x"}); err != nil {
		t.Fatalf("Do without a gate: %v", err)
	}
}
