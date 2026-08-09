package capsoak

import (
	"context"
	"fmt"
	"time"
)

// waitReplicas polls until EffectiveReplicas meets cond or timeout.
func waitReplicas(ctx context.Context, every time.Duration, reportEvery time.Duration, label string, get func(context.Context) (Shape, error), ok func(Shape) bool) (Shape, error) {
	deadline, hasDeadline := ctx.Deadline()
	var lastReport time.Time
	for {
		sh, err := get(ctx)
		if err != nil {
			return sh, err
		}
		if ok(sh) {
			return sh, nil
		}
		now := time.Now()
		if reportEvery > 0 && (lastReport.IsZero() || now.Sub(lastReport) >= reportEvery) {
			fmt.Printf("capacity_soak: waiting %s desired=%d running=%d source=%s\n",
				label, sh.Desired, sh.Running, sh.Source)
			lastReport = now
		}
		if hasDeadline && now.After(deadline) {
			return sh, fmt.Errorf("timeout waiting for %s (desired=%d running=%d)", label, sh.Desired, sh.Running)
		}
		t := time.NewTimer(every)
		select {
		case <-ctx.Done():
			t.Stop()
			return sh, ctx.Err()
		case <-t.C:
		}
	}
}
