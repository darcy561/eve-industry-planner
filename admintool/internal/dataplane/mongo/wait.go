package mongo

import (
	"context"
	"fmt"
	"time"
)

// retry calls fn until it returns nil, ctx cancels, or timeout elapses.
// last non-nil error from fn is wrapped on timeout when present.
func retry(ctx context.Context, timeout, every time.Duration, fn func() error) error {
	if every <= 0 {
		every = time.Second
	}
	deadline := time.Now().Add(timeout)
	var last error
	for time.Now().Before(deadline) {
		if err := fn(); err == nil {
			return nil
		} else {
			last = err
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(every):
		}
	}
	if last != nil {
		return fmt.Errorf("timed out after %s: %w", timeout, last)
	}
	return fmt.Errorf("timed out after %s", timeout)
}
