package taskrun

import (
	"context"
	"testing"
)

// Outside a running task there is nothing to report, and a caller must be able
// to tell that apart from a run with no attempts left: reading an absent budget
// as spent would stop work that had not been tried.
func TestNoRunIsReportedOutsideATask(t *testing.T) {
	t.Parallel()

	if run, ok := Current(context.Background()); ok {
		t.Fatalf("reported %+v where no task is running", run)
	}
}

// The last attempt is when the retries used have reached the limit, not passed
// it. Off by one in either direction either gives up a go early or lets the
// queue archive the task before anything recorded why.
func TestFinalAttemptIsTheLastOneTheQueueWillRun(t *testing.T) {
	t.Parallel()

	cases := map[string]struct {
		run  Run
		want bool
	}{
		"first of several":     {Run{Retried: 0, MaxRetries: 3}, false},
		"one still to come":    {Run{Retried: 2, MaxRetries: 3}, false},
		"the last one":         {Run{Retried: 3, MaxRetries: 3}, true},
		"past the limit":       {Run{Retried: 4, MaxRetries: 3}, true},
		"no retries permitted": {Run{Retried: 0, MaxRetries: 0}, true},
	}

	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			if got := tc.run.FinalAttempt(); got != tc.want {
				t.Errorf("FinalAttempt() = %v for %d of %d, want %v",
					got, tc.run.Retried, tc.run.MaxRetries, tc.want)
			}
		})
	}
}
