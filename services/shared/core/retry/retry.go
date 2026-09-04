package retry

import (
	"context"
	"fmt"
	"math/rand/v2"
	"time"
)

// Config defines retry behaviour for transient external failures.
type Config struct {
	MaxAttempts   int
	InitialDelay  time.Duration
	MaxDelay      time.Duration
	OperationName string
	// Jitter is the fraction of each backoff left to chance, 0 to 1. Replicas
	// that fail together would otherwise retry together; 0.5 keeps half the
	// delay fixed and spreads the rest.
	Jitter float64
	// DelayHint lets an error carry its own wait, so a server that says when to
	// come back is obeyed instead of guessed at. Returning false falls through
	// to the backoff.
	DelayHint func(error) (time.Duration, bool)
}

// Option overrides default retry behaviour. Pass zero or more to Do.
type Option func(*Config)

// AttemptContext includes metadata for retry callbacks.
type AttemptContext struct {
	Attempt     int
	MaxAttempts int
}

// DefaultConfig returns conservative defaults for external API calls.
func DefaultConfig() Config {
	return Config{
		MaxAttempts:  3,
		InitialDelay: 200 * time.Millisecond,
		MaxDelay:     2 * time.Second,
		Jitter:       0.5,
	}
}

// WithMaxAttempts sets the maximum number of attempts (including the first try).
func WithMaxAttempts(n int) Option {
	return func(c *Config) {
		c.MaxAttempts = n
	}
}

// WithInitialDelay sets the delay before the first retry (after attempt 1 fails).
func WithInitialDelay(d time.Duration) Option {
	return func(c *Config) {
		c.InitialDelay = d
	}
}

// WithMaxDelay caps exponential backoff between attempts.
func WithMaxDelay(d time.Duration) Option {
	return func(c *Config) {
		c.MaxDelay = d
	}
}

// WithJitter sets the fraction of each backoff left to chance, 0 to 1.
func WithJitter(fraction float64) Option {
	return func(c *Config) {
		c.Jitter = fraction
	}
}

// WithDelayHint supplies a function that reads a wait out of an error, for
// servers that state when to come back. Returning false uses the backoff.
func WithDelayHint(hint func(error) (time.Duration, bool)) Option {
	return func(c *Config) {
		c.DelayHint = hint
	}
}

// WithOperationName sets a name used only in the exhausted-retry error message.
func WithOperationName(name string) Option {
	return func(c *Config) {
		c.OperationName = name
	}
}

// Do executes operation with exponential backoff while shouldRetry returns true.
// Defaults match DefaultConfig(); pass Options only when you need overrides.
func Do(
	ctx context.Context,
	operation func(context.Context) error,
	shouldRetry func(error, AttemptContext) bool,
	opts ...Option,
) error {
	cfg := DefaultConfig()
	for _, opt := range opts {
		opt(&cfg)
	}

	if cfg.MaxAttempts <= 0 {
		cfg.MaxAttempts = 3
	}
	if cfg.InitialDelay <= 0 {
		cfg.InitialDelay = 200 * time.Millisecond
	}
	if cfg.MaxDelay <= 0 {
		cfg.MaxDelay = 2 * time.Second
	}

	var lastErr error
	for attempt := 1; attempt <= cfg.MaxAttempts; attempt++ {
		if err := ctx.Err(); err != nil {
			return err
		}

		err := operation(ctx)
		if err == nil {
			return nil
		}

		lastErr = err
		attemptCtx := AttemptContext{
			Attempt:     attempt,
			MaxAttempts: cfg.MaxAttempts,
		}
		if attempt == cfg.MaxAttempts || !shouldRetry(err, attemptCtx) {
			return err
		}

		delay := cfg.delayFor(attempt, err)

		// Sleeping into a deadline that will cancel the next attempt wastes the
		// wait. Stop now, and report both why we stopped and what last failed.
		if deadline, ok := ctx.Deadline(); ok && time.Now().Add(delay).After(deadline) {
			return fmt.Errorf("%w before the next attempt: %w", context.DeadlineExceeded, err)
		}

		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(delay):
		}
	}

	opName := cfg.OperationName
	if opName == "" {
		opName = "operation"
	}
	return fmt.Errorf("%s failed after %d attempts: %w", opName, cfg.MaxAttempts, lastErr)
}

// DoValue is Do for an operation that produces a value.
func DoValue[T any](
	ctx context.Context,
	operation func(context.Context) (T, error),
	shouldRetry func(error, AttemptContext) bool,
	opts ...Option,
) (T, error) {
	var out T
	err := Do(ctx, func(c context.Context) error {
		v, err := operation(c)
		if err != nil {
			return err
		}
		out = v
		return nil
	}, shouldRetry, opts...)
	if err != nil {
		var zero T
		return zero, err
	}
	return out, nil
}

// delayFor prefers a wait the error itself carries, and otherwise backs off
// exponentially with jitter, capped at MaxDelay.
func (c Config) delayFor(attempt int, err error) time.Duration {
	if c.DelayHint != nil {
		if hinted, ok := c.DelayHint(err); ok && hinted > 0 {
			return min(hinted, c.MaxDelay)
		}
	}

	delay := min(c.InitialDelay*time.Duration(1<<(attempt-1)), c.MaxDelay)

	fraction := min(max(c.Jitter, 0), 1)
	if fraction == 0 {
		return delay
	}
	spread := time.Duration(float64(delay) * fraction)
	return delay - spread + time.Duration(rand.Int64N(int64(spread)+1))
}
