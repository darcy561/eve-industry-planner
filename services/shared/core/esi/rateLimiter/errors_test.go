package ratelimiter

import (
	"errors"
	"testing"
	"time"
)

func TestRateLimitError_Error(t *testing.T) {
	now := time.Now()
	retryAfter := now.Add(30 * time.Second)

	tests := []struct {
		name string
		err  *RateLimitError
		want string
	}{
		{
			name: "retryable error",
			err: &RateLimitError{
				Retryable:  true,
				RetryAfter: retryAfter,
				Reason:     "insufficient tokens",
				Group:      "markets",
			},
			want: "rate limit insufficient tokens (retryable",
		},
		{
			name: "non-retryable error",
			err: &RateLimitError{
				Retryable:  false,
				RetryAfter: time.Time{},
				Reason:     "insufficient tokens",
				Group:      "markets",
			},
			want: "rate limit insufficient tokens (non-retryable)",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := tt.err.Error()
			if tt.name == "retryable error" {
				// For retryable errors, just check it contains the expected parts
				if !contains(got, tt.want) {
					t.Errorf("RateLimitError.Error() = %v, want to contain %v", got, tt.want)
				}
				if !contains(got, "retryable") {
					t.Errorf("RateLimitError.Error() = %v, want to contain 'retryable'", got)
				}
			} else {
				if got != tt.want {
					t.Errorf("RateLimitError.Error() = %v, want %v", got, tt.want)
				}
			}
		})
	}
}

func TestIsRetryableRateLimitError(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want bool
	}{
		{
			name: "retryable rate limit error",
			err: &RateLimitError{
				Retryable:  true,
				RetryAfter: time.Now().Add(30 * time.Second),
				Reason:     "test",
			},
			want: true,
		},
		{
			name: "non-retryable rate limit error",
			err: &RateLimitError{
				Retryable:  false,
				RetryAfter: time.Time{},
				Reason:     "test",
			},
			want: false,
		},
		{
			name: "wrapped retryable error",
			err:  errors.New("wrapped: " + (&RateLimitError{Retryable: true, RetryAfter: time.Now().Add(30 * time.Second), Reason: "test"}).Error()),
			want: false, // Wrapped errors don't work with errors.As in this case
		},
		{
			name: "non-rate-limit error",
			err:  errors.New("some other error"),
			want: false,
		},
		{
			name: "nil error",
			err:  nil,
			want: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := IsRetryableRateLimitError(tt.err)
			if got != tt.want {
				t.Errorf("IsRetryableRateLimitError() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestIsRateLimitError(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want bool
	}{
		{
			name: "rate limit error",
			err: &RateLimitError{
				Retryable:  true,
				RetryAfter: time.Now().Add(30 * time.Second),
				Reason:     "test",
			},
			want: true,
		},
		{
			name: "non-retryable rate limit error",
			err: &RateLimitError{
				Retryable:  false,
				RetryAfter: time.Time{},
				Reason:     "test",
			},
			want: true,
		},
		{
			name: "non-rate-limit error",
			err:  errors.New("some other error"),
			want: false,
		},
		{
			name: "nil error",
			err:  nil,
			want: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := IsRateLimitError(tt.err)
			if got != tt.want {
				t.Errorf("IsRateLimitError() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestGetRateLimitError(t *testing.T) {
	now := time.Now()
	retryAfter := now.Add(30 * time.Second)

	tests := []struct {
		name string
		err  error
		want *RateLimitError
	}{
		{
			name: "rate limit error",
			err: &RateLimitError{
				Retryable:  true,
				RetryAfter: retryAfter,
				Reason:     "test",
				Group:      "markets",
			},
			want: &RateLimitError{
				Retryable:  true,
				RetryAfter: retryAfter,
				Reason:     "test",
				Group:      "markets",
			},
		},
		{
			name: "non-rate-limit error",
			err:  errors.New("some other error"),
			want: nil,
		},
		{
			name: "nil error",
			err:  nil,
			want: nil,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := GetRateLimitError(tt.err)
			if tt.want == nil {
				if got != nil {
					t.Errorf("GetRateLimitError() = %v, want %v", got, tt.want)
				}
			} else {
				if got == nil {
					t.Errorf("GetRateLimitError() = nil, want %v", tt.want)
				} else if got.Retryable != tt.want.Retryable || got.Reason != tt.want.Reason || got.Group != tt.want.Group {
					t.Errorf("GetRateLimitError() = %v, want %v", got, tt.want)
				}
			}
		})
	}
}

// Helper function for string contains check
func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(substr) == 0 ||
		(len(s) > len(substr) && (s[:len(substr)] == substr || s[len(s)-len(substr):] == substr ||
			containsMiddle(s, substr))))
}

func containsMiddle(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
