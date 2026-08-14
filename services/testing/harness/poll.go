package harness

import (
	"context"
	"fmt"
	"time"
)

// PollOptions configures PollUntil.
type PollOptions struct {
	Every       time.Duration
	ReportEvery time.Duration
	// Alive is checked each tick; non-nil fails the wait (e.g. hold ended early).
	Alive func() error
	// Report is called on the report interval with the last observed value label.
	Report func(msg string)
}

// PollUntil polls try until it returns true or ctx ends.
// try should return (done, progressMessage, err).
func PollUntil(ctx context.Context, opts PollOptions, try func(context.Context) (bool, string, error)) error {
	if opts.Every <= 0 {
		opts.Every = 5 * time.Second
	}
	deadline, hasDeadline := ctx.Deadline()
	var lastReport time.Time
	for {
		if opts.Alive != nil {
			if err := opts.Alive(); err != nil {
				return err
			}
		}
		ok, msg, err := try(ctx)
		if err != nil {
			return err
		}
		if ok {
			return nil
		}
		now := time.Now()
		if opts.Report != nil && opts.ReportEvery > 0 && (lastReport.IsZero() || now.Sub(lastReport) >= opts.ReportEvery) {
			opts.Report(msg)
			lastReport = now
		}
		if hasDeadline && !now.Before(deadline) {
			if msg != "" {
				return fmt.Errorf("timeout: %s", msg)
			}
			return fmt.Errorf("timeout")
		}
		t := time.NewTimer(opts.Every)
		select {
		case <-ctx.Done():
			t.Stop()
			return ctx.Err()
		case <-t.C:
		}
	}
}
