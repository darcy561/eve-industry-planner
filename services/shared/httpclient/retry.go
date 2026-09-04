package httpclient

import (
	"context"
	"errors"
	"net"
	"net/http"
	"strconv"
	"time"

	"eve-industry-planner/shared/core/retry"
)

// Retrying an HTTP call and rate limiting an HTTP call are the same decision
// made twice, so where the retry sits decides whether the budget stays honest.
//
// A client that retries inside its own Do would send several requests against
// one admission. Behind a rate limiter that reserves per request, that spends
// budget it never reserved. So retry belongs around the *whole* admit-and-send
// cycle, not around the send:
//
//	retry.Do(ctx, func(ctx context.Context) error {
//	    permit, err := limiter.Acquire(ctx, bucket)   // reserves
//	    ...
//	    resp, err := client.Do(ctx, req)              // spends
//	    ...
//	    return limiter.Settle(ctx, permit, resp)      // reconciles
//	}, httpclient.Retryable(method))
//
// DoRetrying below is the convenience for the other case — a call with no
// limiter in front of it, where one attempt is one request.

// RetryableMethods are the methods safe to repeat without asking. A repeated
// POST may act twice, so it retries only when a caller says so explicitly.
var RetryableMethods = map[string]bool{
	http.MethodGet:     true,
	http.MethodHead:    true,
	http.MethodPut:     true,
	http.MethodDelete:  true,
	http.MethodOptions: true,
}

// RetryOptions tunes Retryable for a call.
type RetryOptions struct {
	// Method decides idempotency. Empty means GET.
	Method string
	// Force repeats a non-idempotent method anyway, for a body the caller knows
	// is safe to send twice.
	Force bool
	// TooManyRequests repeats a 429 using its Retry-After.
	//
	// Leave this false behind a rate limiter. A 429 is the limiter's to absorb:
	// it holds the gate that stops every other caller and every other replica,
	// and a retry here would spend the budget that gate exists to protect.
	TooManyRequests bool
}

// Retryable reports whether an attempt is worth repeating, for retry.Do.
//
// Repeat: transport failures and 5xx, neither of which the origin charged us
// for and both of which may differ next time.
//
// Do not repeat: any other 4xx — it will not improve, and where an origin
// prices by response class an error costs more than a success. Nor a context
// error, an oversized body, or a status the caller reads as data.
func Retryable(opts RetryOptions) func(error, retry.AttemptContext) bool {
	method := opts.Method
	if method == "" {
		method = http.MethodGet
	}
	idempotent := opts.Force || RetryableMethods[method]

	return func(err error, _ retry.AttemptContext) bool {
		if err == nil || !idempotent {
			return false
		}
		if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
			return false
		}
		if _, ok := errors.AsType[*BodyTooLargeError](err); ok {
			return false
		}

		if statusErr, ok := errors.AsType[*StatusError](err); ok {
			switch {
			case statusErr.Status == http.StatusTooManyRequests:
				return opts.TooManyRequests
			case statusErr.Status == http.StatusNotImplemented:
				return false
			case statusErr.Status >= 500:
				return true
			default:
				return false
			}
		}

		// Anything left is a transport failure: dial, reset, timeout, EOF.
		var netErr net.Error
		return errors.As(err, &netErr) || errors.Is(err, net.ErrClosed) || isTransportError(err)
	}
}

// RetryAfterHint reads the wait a 503 or 429 states, for retry.WithDelayHint.
// Retry-After is either a count of seconds or an HTTP date.
func RetryAfterHint(err error) (time.Duration, bool) {
	statusErr, ok := errors.AsType[*StatusError](err)
	if !ok || statusErr.Header == nil {
		return 0, false
	}
	raw := statusErr.Header.Get("Retry-After")
	if raw == "" {
		return 0, false
	}
	if secs, convErr := strconv.Atoi(raw); convErr == nil {
		if secs < 0 {
			return 0, false
		}
		return time.Duration(secs) * time.Second, true
	}
	if when, parseErr := http.ParseTime(raw); parseErr == nil {
		if d := time.Until(when); d > 0 {
			return d, true
		}
		return 0, true
	}
	return 0, false
}

// DoRetrying is Do with repeats, for a call that has no rate limiter in front
// of it — one attempt is one request. Behind a limiter, wrap the admit-and-send
// cycle with retry.Do instead; see the note at the top of this file.
//
// A status the caller wants to act on rather than repeat still arrives as a
// Response: only the classes Retryable repeats are turned into errors here.
func (c *Client) DoRetrying(ctx context.Context, req Request, opts RetryOptions, retryOpts ...retry.Option) (*Response, error) {
	if opts.Method == "" {
		opts.Method = req.Method
	}
	options := append([]retry.Option{retry.WithDelayHint(RetryAfterHint)}, retryOpts...)

	return retry.DoValue(ctx, func(attemptCtx context.Context) (*Response, error) {
		resp, err := c.Do(attemptCtx, req)
		if err != nil {
			return nil, err
		}
		if worthRepeating(resp.Status, opts) {
			return nil, &StatusError{Status: resp.Status, Header: resp.Header, Snippet: snippet(resp.Body)}
		}
		return resp, nil
	}, Retryable(opts), options...)
}

// StreamRetrying repeats only the part of a stream that can be repeated: getting
// the response headers. Once the body is being read, the bytes already consumed
// make a second attempt a different operation, so a mid-read failure is the
// caller's to handle.
func (c *Client) StreamRetrying(ctx context.Context, req Request, opts RetryOptions, retryOpts ...retry.Option) (*Stream, error) {
	if opts.Method == "" {
		opts.Method = req.Method
	}
	options := append([]retry.Option{retry.WithDelayHint(RetryAfterHint)}, retryOpts...)

	return retry.DoValue(ctx, func(attemptCtx context.Context) (*Stream, error) {
		stream, err := c.Stream(attemptCtx, req)
		if err != nil {
			return nil, err
		}
		if worthRepeating(stream.Status, opts) {
			stream.Body.Close()
			return nil, &StatusError{Status: stream.Status, Header: stream.Header}
		}
		return stream, nil
	}, Retryable(opts), options...)
}

func worthRepeating(status int, opts RetryOptions) bool {
	switch {
	case status == http.StatusTooManyRequests:
		return opts.TooManyRequests
	case status == http.StatusNotImplemented:
		return false
	default:
		return status >= 500
	}
}

func isTransportError(err error) bool {
	if _, ok := errors.AsType[*net.OpError](err); ok {
		return true
	}
	var dnsErr *net.DNSError
	return errors.As(err, &dnsErr)
}
