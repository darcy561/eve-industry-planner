package httpclient

import (
	"context"
	"errors"
	"math/rand/v2"
	"net"
	"net/http"
	"strconv"
	"time"
)

// Retry says when a call is worth sending again and how long to leave between
// tries. The zero value does not retry.
//
// Each attempt is admitted and settled through the client's Gate on its own, so
// a retried call reserves the budget it spends.
type Retry struct {
	// Attempts is the total number of tries, first included. Zero or one means
	// no retrying.
	Attempts int
	// BaseDelay is the wait after the first failure; it doubles from there.
	BaseDelay time.Duration
	// MaxDelay caps that growth.
	MaxDelay time.Duration
	// Jitter is the fraction of each wait left to chance, 0 to 1. Replicas that
	// fail together retry together without it.
	Jitter float64

	// RepeatStatus and RepeatError override the defaults below.
	RepeatStatus func(status int) bool
	RepeatError  func(err error) bool
	// NonIdempotent repeats a method that is not safe to repeat unasked; a
	// second POST may act twice.
	NonIdempotent bool
	// IgnoreRetryAfter uses the backoff even when the origin stated a wait.
	IgnoreRetryAfter bool
}

// DefaultRetry is a conservative starting point for an idempotent call.
func DefaultRetry() Retry {
	return Retry{
		Attempts:  3,
		BaseDelay: 200 * time.Millisecond,
		MaxDelay:  2 * time.Second,
		Jitter:    0.5,
	}
}

// idempotentMethods are safe to send again without being asked.
var idempotentMethods = map[string]bool{
	http.MethodGet:     true,
	http.MethodHead:    true,
	http.MethodPut:     true,
	http.MethodDelete:  true,
	http.MethodOptions: true,
}

// RepeatServerErrors repeats 5xx other than 501, and nothing else. A 4xx will
// not come good, and where an origin prices responses by class it can cost more
// than a success. A 429 belongs to whatever is pacing the calls, which holds the
// state that stops the other callers too.
func RepeatServerErrors(status int) bool {
	return status >= 500 && status != http.StatusNotImplemented
}

// RepeatTransportErrors repeats failures that produced no response: dial,
// reset, timeout, DNS. Context and body-size errors are not among them.
func RepeatTransportErrors(err error) bool {
	switch {
	case err == nil:
		return false
	case errors.Is(err, context.Canceled), errors.Is(err, context.DeadlineExceeded):
		return false
	case isKind[*BodyTooLargeError](err), isKind[*gateError](err):
		return false
	case isKind[net.Error](err), isKind[*net.OpError](err), isKind[*net.DNSError](err):
		return true
	default:
		return errors.Is(err, net.ErrClosed)
	}
}

// isKind reports whether err is or wraps T, as one value so the checks above
// read as a single switch.
func isKind[T error](err error) bool {
	_, ok := errors.AsType[T](err)
	return ok
}

func (r Retry) repeatStatus(status int) bool {
	if r.RepeatStatus != nil {
		return r.RepeatStatus(status)
	}
	return RepeatServerErrors(status)
}

func (r Retry) repeatError(err error) bool {
	switch {
	case isKind[*gateError](err):
		return false
	case r.RepeatError != nil:
		return r.RepeatError(err)
	default:
		return RepeatTransportErrors(err)
	}
}

func (r Retry) allows(method string) bool {
	switch {
	case r.Attempts <= 1:
		return false
	case r.NonIdempotent:
		return true
	case method == "":
		return idempotentMethods[http.MethodGet]
	default:
		return idempotentMethods[method]
	}
}

// wait is how long to leave before attempt+1. A stated Retry-After wins;
// otherwise the delay doubles from BaseDelay with jitter, capped at MaxDelay.
func (r Retry) wait(attempt int, header http.Header) time.Duration {
	if !r.IgnoreRetryAfter && header != nil {
		if stated, ok := retryAfter(header); ok {
			return min(stated, r.MaxDelay)
		}
	}

	base := r.BaseDelay
	if base <= 0 {
		base = 200 * time.Millisecond
	}
	maxDelay := r.MaxDelay
	if maxDelay <= 0 {
		maxDelay = 2 * time.Second
	}

	delay := min(base*time.Duration(1<<(attempt-1)), maxDelay)

	fraction := min(max(r.Jitter, 0), 1)
	if fraction == 0 {
		return delay
	}
	spread := time.Duration(float64(delay) * fraction)
	return delay - spread + time.Duration(rand.Int64N(int64(spread)+1))
}

// retryAfter reads the wait an origin stated, in seconds or as an HTTP date.
func retryAfter(header http.Header) (time.Duration, bool) {
	raw := header.Get("Retry-After")
	if raw == "" {
		return 0, false
	}

	secs, secsErr := strconv.Atoi(raw)
	when, dateErr := http.ParseTime(raw)

	switch {
	case secsErr == nil && secs >= 0:
		return time.Duration(secs) * time.Second, true
	case dateErr == nil:
		return max(time.Until(when), 0), true
	default:
		return 0, false
	}
}

// sleep reports whether the wait completed. Sleeping into a deadline that will
// cancel the next attempt spends the time and buries the real failure.
func (r Retry) sleep(ctx context.Context, delay time.Duration) bool {
	if deadline, ok := ctx.Deadline(); ok && time.Now().Add(delay).After(deadline) {
		return false
	}
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-timer.C:
		return true
	}
}
