package retry

import (
	"context"
	"fmt"
	"time"
)

// Config defines retry behaviour for transient external failures.
type Config struct {
	MaxAttempts   int
	InitialDelay  time.Duration
	MaxDelay      time.Duration
	OperationName string
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

		delay := cfg.InitialDelay * time.Duration(1<<(attempt-1))
		if delay > cfg.MaxDelay {
			delay = cfg.MaxDelay
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
