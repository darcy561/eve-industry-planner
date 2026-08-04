package main

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

// waitSoftFull polls Redis until soft and/or full keys appear (or ctx done).
// seenSoft / seenFull are updated as soon as each class is observed.
func waitSoftFull(ctx context.Context, rdb *redis.Client, wantSoft, wantFull bool, every time.Duration, seenSoft, seenFull *bool) error {
	if every <= 0 {
		every = 500 * time.Millisecond
	}
	t := time.NewTicker(every)
	defer t.Stop()
	for {
		soft, full, err := probeSoftFull(ctx, rdb)
		if err != nil {
			return err
		}
		if len(soft) > 0 {
			*seenSoft = true
		}
		if len(full) > 0 {
			*seenFull = true
		}
		if (!wantSoft || *seenSoft) && (!wantFull || *seenFull) {
			return nil
		}
		select {
		case <-ctx.Done():
			return fmt.Errorf("timeout waiting soft=%v (seen=%v) full=%v (seen=%v): %w", wantSoft, *seenSoft, wantFull, *seenFull, ctx.Err())
		case <-t.C:
		}
	}
}

// waitLive blocks until st.live >= want or ctx done.
func waitLive(ctx context.Context, st *stats, want int64, every time.Duration) error {
	if every <= 0 {
		every = 100 * time.Millisecond
	}
	t := time.NewTicker(every)
	defer t.Stop()
	for {
		if st.live.Load() >= want {
			return nil
		}
		select {
		case <-ctx.Done():
			return fmt.Errorf("timeout waiting live>=%d (have %d): %w", want, st.live.Load(), ctx.Err())
		case <-t.C:
		}
	}
}
