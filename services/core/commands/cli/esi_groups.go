package cli

import (
	"context"
	"encoding/json"
	"eve-industry-planner/shared/lifecycle"
	"eve-industry-planner/shared/stackservices"
	"fmt"
	"time"

	esimetrics "eve-industry-planner/core/metrics/esi"
	"eve-industry-planner/shared/esiclient"
)

// RunEsiRateLimitGroups prints the ESI limiter's bucket state.
func RunEsiRateLimitGroups() error {
	ctx := context.Background()
	clients, stopDeps, err := stackservices.Connect(ctx, stackservices.Redis)
	if err != nil {
		return fmt.Errorf("failed connecting to redis: %w", err)
	}
	defer lifecycle.RunCleanups(5*time.Second, stopDeps)

	store := esiclient.NewStore(clients.Redis, esiclient.DefaultConfig())
	now := time.Now()

	buckets, err := esimetrics.Read(ctx, store, now)
	if err != nil {
		return err
	}
	downtime, err := store.Downtime(ctx)
	if err != nil {
		return err
	}

	out := map[string]any{
		"retrieved_at": now.UTC().Format(time.RFC3339),
		"bucket_count": len(buckets),
		"buckets":      buckets,
		"servers_answering": map[string]any{
			"gated":      downtime.Gated,
			"failures":   downtime.Failures,
			"next_probe": stampOrEmpty(downtime.NextProbe),
			"last_ok":    stampOrEmpty(downtime.LastOK),
		},
	}
	b, err := json.MarshalIndent(out, "", "  ")
	if err != nil {
		return fmt.Errorf("failed formatting ESI bucket state output: %w", err)
	}
	fmt.Println(string(b))
	return nil
}

// RunResetEsiRateLimitGroups drops what the limiter has learned about each
// bucket — the allowance read from ESI response headers — and keeps the ledger
// of what has been spent.
//
// The allowance is relearned from the next call at no cost, so clearing it is
// how an operator recovers from a stale or wrong one. The ledger is the record
// of spend inside the window ESI is still counting: clearing that would let
// every replica spend the same budget twice and earn a 429, which is the one
// thing this command must not do.
func RunResetEsiRateLimitGroups() error {
	ctx := context.Background()
	clients, stopDeps, err := stackservices.Connect(ctx, stackservices.Redis)
	if err != nil {
		return fmt.Errorf("failed connecting to redis: %w", err)
	}
	defer lifecycle.RunCleanups(5*time.Second, stopDeps)

	store := esiclient.NewStore(clients.Redis, esiclient.DefaultConfig())
	buckets, err := store.Buckets(ctx)
	if err != nil {
		return err
	}

	type bucketReset struct {
		Group  string `json:"group"`
		Bucket string `json:"bucket"`
		Forgot bool   `json:"forgot_allowance"`
	}

	out := make([]bucketReset, 0, len(buckets))
	var total int64
	for _, bucket := range buckets {
		deleted, err := store.Forget(ctx, bucket)
		if err != nil {
			return err
		}
		total += deleted
		out = append(out, bucketReset{Group: bucket.Group, Bucket: bucket.Key(), Forgot: deleted > 0})
	}

	payload := map[string]any{
		"action":       "forget_esi_bucket_allowances",
		"finished_at":  time.Now().UTC().Format(time.RFC3339),
		"bucket_count": len(buckets),
		"keys_deleted": total,
		"ledger":       "kept — it records spend ESI is still counting",
		"buckets":      out,
	}
	b, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return fmt.Errorf("failed formatting reset output: %w", err)
	}
	fmt.Println(string(b))
	return nil
}

func stampOrEmpty(t time.Time) string {
	if t.IsZero() {
		return ""
	}
	return t.UTC().Format(time.RFC3339)
}

func runImmediateCleanups(cleanups ...func(context.Context)) {
	for _, fn := range cleanups {
		if fn == nil {
			continue
		}
		cctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		func() {
			defer cancel()
			fn(cctx)
		}()
	}
}
