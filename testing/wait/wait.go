// Package wait polls a condition until it holds.
//
// Both forms take a condition that returns a detail string describing what it
// just observed. That detail is what a timeout reports, so a failure says what
// the condition actually saw rather than only that it never held.
//
// For is the test form (fails the test). Until is the long-running form
// (returns an error, reports progress) used by the soak tools.
package wait

import (
	"context"
	"fmt"
	"testing"
	"time"
)

// testPollInterval is how often For rechecks. Short enough that a test does not
// pay for it, long enough not to spin.
const testPollInterval = 10 * time.Millisecond

// For polls cond until it reports true, failing the test if timeout passes
// first. cond returns whether the condition holds and a detail string for the
// failure message.
func For(t testing.TB, timeout time.Duration, cond func() (bool, string)) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	var detail string
	for {
		var ok bool
		ok, detail = cond()
		if ok {
			return
		}
		if !time.Now().Before(deadline) {
			break
		}
		time.Sleep(testPollInterval)
	}
	if detail == "" {
		t.Fatalf("condition not met within %v", timeout)
	}
	t.Fatalf("condition not met within %v: %s", timeout, detail)
}

// Options configures Until.
type Options struct {
	Every       time.Duration
	ReportEvery time.Duration
	// Alive is checked each tick; a non-nil error ends the wait (e.g. the work
	// being waited on stopped early).
	Alive func() error
	// Report is called on the report interval with the last detail string.
	Report func(msg string)
}

// Until polls try until it reports done or ctx ends.
// try returns (done, detail, err).
func Until(ctx context.Context, opts Options, try func(context.Context) (bool, string, error)) error {
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
