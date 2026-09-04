package httpclient

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"eve-industry-planner/shared/core/retry"
)

func fastRetry(attempts int) []retry.Option {
	return []retry.Option{
		retry.WithMaxAttempts(attempts),
		retry.WithInitialDelay(time.Millisecond),
		retry.WithMaxDelay(2 * time.Millisecond),
	}
}

func TestDoRetryingRepeatsServerErrors(t *testing.T) {
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		if calls.Add(1) < 3 {
			w.WriteHeader(http.StatusBadGateway)
			return
		}
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer srv.Close()

	resp, err := newTestClient(t, srv, Config{}).
		DoRetrying(t.Context(), Request{Path: "/x"}, RetryOptions{}, fastRetry(4)...)
	if err != nil {
		t.Fatalf("DoRetrying: %v", err)
	}
	if resp.Status != http.StatusOK {
		t.Errorf("Status = %d", resp.Status)
	}
	if got := calls.Load(); got != 3 {
		t.Errorf("attempts = %d, want 3", got)
	}
}

func TestDoRetryingDoesNotRepeatClientErrors(t *testing.T) {
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls.Add(1)
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()

	resp, err := newTestClient(t, srv, Config{}).
		DoRetrying(t.Context(), Request{Path: "/x"}, RetryOptions{}, fastRetry(4)...)
	if err != nil {
		t.Fatalf("a 404 is data, not an error: %v", err)
	}
	if resp.Status != http.StatusNotFound {
		t.Errorf("Status = %d", resp.Status)
	}
	if got := calls.Load(); got != 1 {
		t.Errorf("attempts = %d, want 1 — a 4xx will not improve and may cost more than a success", got)
	}
}

func TestDoRetryingLeaves429ToTheLimiterByDefault(t *testing.T) {
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls.Add(1)
		w.Header().Set("Retry-After", "1")
		w.WriteHeader(http.StatusTooManyRequests)
	}))
	defer srv.Close()

	client := newTestClient(t, srv, Config{})
	resp, err := client.DoRetrying(t.Context(), Request{Path: "/x"}, RetryOptions{}, fastRetry(4)...)
	if err != nil {
		t.Fatalf("DoRetrying: %v", err)
	}
	if resp.Status != http.StatusTooManyRequests {
		t.Errorf("Status = %d", resp.Status)
	}
	if got := calls.Load(); got != 1 {
		t.Fatalf("attempts = %d, want 1 — a rate limiter owns the 429, not the retry loop", got)
	}

	calls.Store(0)
	_, err = client.DoRetrying(t.Context(), Request{Path: "/x"},
		RetryOptions{TooManyRequests: true}, fastRetry(2)...)
	if err == nil {
		t.Fatal("opted-in 429 retry should exhaust and return an error")
	}
	if got := calls.Load(); got != 2 {
		t.Errorf("attempts = %d, want 2 when opted in", got)
	}
}

func TestPostIsNotRepeatedUnlessForced(t *testing.T) {
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls.Add(1)
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer srv.Close()

	client := newTestClient(t, srv, Config{})
	req := Request{Method: http.MethodPost, Path: "/x", Body: []byte(`[1]`)}

	if _, err := client.DoRetrying(t.Context(), req, RetryOptions{}, fastRetry(4)...); err == nil {
		t.Fatal("expected the 503 to surface as an error")
	}
	if got := calls.Load(); got != 1 {
		t.Errorf("attempts = %d, want 1 for an unforced POST", got)
	}

	calls.Store(0)
	if _, err := client.DoRetrying(t.Context(), req, RetryOptions{Force: true}, fastRetry(3)...); err == nil {
		t.Fatal("expected the 503 to surface as an error")
	}
	if got := calls.Load(); got != 3 {
		t.Errorf("attempts = %d, want 3 when forced", got)
	}
}

func TestRetryAfterHint(t *testing.T) {
	cases := []struct {
		name   string
		header string
		want   time.Duration
		ok     bool
	}{
		{name: "seconds", header: "5", want: 5 * time.Second, ok: true},
		{name: "http date", header: time.Now().Add(3 * time.Second).UTC().Format(http.TimeFormat), want: time.Second, ok: true},
		{name: "past date", header: time.Now().Add(-time.Hour).UTC().Format(http.TimeFormat), want: 0, ok: true},
		{name: "absent", header: "", ok: false},
		{name: "nonsense", header: "soon", ok: false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			header := http.Header{}
			if tc.header != "" {
				header.Set("Retry-After", tc.header)
			}
			got, ok := RetryAfterHint(&StatusError{Status: 503, Header: header})
			if ok != tc.ok {
				t.Fatalf("ok = %v, want %v", ok, tc.ok)
			}
			if ok && got < tc.want {
				t.Errorf("delay = %v, want at least %v", got, tc.want)
			}
		})
	}

	if _, ok := RetryAfterHint(errors.New("not a status error")); ok {
		t.Error("a non-status error should carry no hint")
	}
}

func TestRetryableRejectsContextErrors(t *testing.T) {
	classify := Retryable(RetryOptions{})
	for _, err := range []error{context.Canceled, context.DeadlineExceeded} {
		if classify(err, retry.AttemptContext{Attempt: 1, MaxAttempts: 3}) {
			t.Errorf("%v should not be retried", err)
		}
	}
	if classify(&BodyTooLargeError{Limit: 10}, retry.AttemptContext{}) {
		t.Error("an oversized body will be oversized again")
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

	_, err := newTestClient(t, srv, Config{}).DoRetrying(ctx, Request{Path: "/x"}, RetryOptions{},
		retry.WithMaxAttempts(5),
		retry.WithInitialDelay(500*time.Millisecond),
		retry.WithMaxDelay(time.Second),
	)
	if err == nil {
		t.Fatal("expected an error")
	}
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Errorf("stopping on the clock should say so: %v", err)
	}
	if _, ok := errors.AsType[*StatusError](err); !ok {
		t.Fatalf("err = %v, should still carry the last *StatusError", err)
	}
	if got := calls.Load(); got != 1 {
		t.Errorf("attempts = %d, want 1 — the backoff exceeded the remaining budget", got)
	}
}

func TestStreamRetryingRepeatsHeaderPhaseOnly(t *testing.T) {
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		if calls.Add(1) < 2 {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		_, _ = w.Write([]byte("row\nrow\n"))
	}))
	defer srv.Close()

	stream, err := newTestClient(t, srv, Config{}).
		StreamRetrying(t.Context(), Request{Path: "/x"}, RetryOptions{}, fastRetry(3)...)
	if err != nil {
		t.Fatalf("StreamRetrying: %v", err)
	}
	defer stream.Body.Close()

	body, err := io.ReadAll(stream.Body)
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	if !strings.HasPrefix(string(body), "row") {
		t.Errorf("body = %q", body)
	}
	if got := calls.Load(); got != 2 {
		t.Errorf("attempts = %d, want 2", got)
	}
}
