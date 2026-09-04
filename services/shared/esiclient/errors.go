package esiclient

import (
	"errors"
	"fmt"
	"time"
)

// Kind says why a call was turned away, which decides both what the caller does
// and when it should come back.
type Kind uint8

const (
	// KindQueued means the bucket is healthy and callers are ahead in the queue.
	// The wait drains at burst pace.
	KindQueued Kind = iota
	// KindDecelerating means the bucket is low and the interval is stretching.
	// Coming back at the next slot would only meet the same wait, so RetryAfter
	// is when the bank recovers.
	KindDecelerating
	// KindGated means the bucket is spent or 429'd.
	KindGated
	// KindBudget means the caller's own deadline cannot cover its slot.
	KindBudget
	// KindErrorLimit means the fleet-wide guard on non-2xx/3xx responses tripped.
	KindErrorLimit
	// KindDowntime means Tranquility is observed unavailable.
	KindDowntime
	// KindDiscovering means another caller is probing this bucket's allowance.
	KindDiscovering
)

func (k Kind) String() string {
	switch k {
	case KindQueued:
		return "queued"
	case KindDecelerating:
		return "decelerating"
	case KindGated:
		return "gated"
	case KindBudget:
		return "task_budget"
	case KindErrorLimit:
		return "error_limit"
	case KindDowntime:
		return "downtime"
	case KindDiscovering:
		return "discovering"
	default:
		return fmt.Sprintf("kind(%d)", uint8(k))
	}
}

// RateLimitError is a refusal to make a call now, carrying when to try again.
// Every one of these is retryable: the question is only when.
type RateLimitError struct {
	Kind       Kind
	RetryAfter time.Time
	Bucket     Bucket
	Headroom   Headroom
	Reason     string
}

func (e *RateLimitError) Error() string {
	return fmt.Sprintf("esi rate limit [%s] %s (bucket %s, retry after %s)",
		e.Kind, e.Reason, e.Bucket, e.RetryAfter.UTC().Format(time.RFC3339Nano))
}

// RetryIn is how long from now the caller should wait, never negative.
func (e *RateLimitError) RetryIn() time.Duration {
	return max(time.Until(e.RetryAfter), 0)
}

// AsRateLimit extracts a *RateLimitError from err if there is one.
func AsRateLimit(err error) (*RateLimitError, bool) {
	return errors.AsType[*RateLimitError](err)
}

// IsRateLimit reports whether err is a refusal from this package.
func IsRateLimit(err error) bool {
	_, ok := AsRateLimit(err)
	return ok
}
