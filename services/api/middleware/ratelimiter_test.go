package middleware

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"eve-industry-planner/shared/logs"

	"github.com/ulule/limiter/v3"
)

type failingRateLimitStore struct{}

func (failingRateLimitStore) Get(context.Context, string, limiter.Rate) (limiter.Context, error) {
	return limiter.Context{}, errors.New("dial tcp: lookup redis: no such host")
}

func (failingRateLimitStore) Peek(context.Context, string, limiter.Rate) (limiter.Context, error) {
	return limiter.Context{}, errors.New("peek failed")
}

func (failingRateLimitStore) Reset(context.Context, string, limiter.Rate) (limiter.Context, error) {
	return limiter.Context{}, errors.New("reset failed")
}

func (failingRateLimitStore) Increment(context.Context, string, int64, limiter.Rate) (limiter.Context, error) {
	return limiter.Context{}, errors.New("increment failed")
}

func TestRateLimiterConstructor_storeErrorReturns503(t *testing.T) {
	rate, err := limiter.NewRateFromFormatted("10-S")
	if err != nil {
		t.Fatal(err)
	}

	var served bool
	handler := RateLimiterConstructor(failingRateLimitStore{}, rate, "test")(
		http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			served = true
			w.WriteHeader(http.StatusOK)
		}),
	)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/eve-sso/tokens/refresh", nil)
	req = req.WithContext(logs.WithHandlerFailureDetailStore(req.Context()))
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if served {
		t.Fatal("expected handler not to run when rate limit store is unavailable")
	}
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusServiceUnavailable)
	}
}
func TestRetryAfterSecondsFromRateLimitReset(t *testing.T) {
	now := time.Unix(1_700_000_000, 0)

	tests := []struct {
		name   string
		reset  string
		want   int64
	}{
		{"future reset", "1700000045", 45},
		{"past reset clamps to 1", "1699999990", 1},
		{"invalid", "nope", 0},
		{"empty", "", 0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := retryAfterSecondsFromRateLimitReset(tt.reset, now)
			if got != tt.want {
				t.Fatalf("retryAfterSecondsFromRateLimitReset(%q) = %d, want %d", tt.reset, got, tt.want)
			}
		})
	}
}

func TestSetFixedWindowRetryAfter(t *testing.T) {
	now := time.Unix(1_700_000_000, 0)
	rec := httptest.NewRecorder()
	rec.Header().Set("X-RateLimit-Reset", "1700000030")

	setFixedWindowRetryAfter(rec, now)

	if got := rec.Header().Get("Retry-After"); got != "30" {
		t.Fatalf("Retry-After = %q, want 30", got)
	}
}
