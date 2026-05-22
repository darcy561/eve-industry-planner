package middleware

import (
	"net/http/httptest"
	"testing"
	"time"
)

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
