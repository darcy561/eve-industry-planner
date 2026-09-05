// Package esi reports the shared ESI limiter's bucket state for core's gauges
// and operator CLI. The state itself belongs to shared/esiclient, which owns
// the keys; this reads it and shapes it for display.
package esi

import (
	"context"
	"time"

	"eve-industry-planner/shared/esiclient"
)

// BucketState is one bucket as an operator reads it.
type BucketState struct {
	Group          string  `json:"group"`
	Scope          string  `json:"scope"`
	TokenLimit     int     `json:"token_limit"`
	TokenUsed      int     `json:"token_used"`
	TokenRemaining int     `json:"token_remaining"`
	Fill           float64 `json:"fill"`
	// Known is false until a response has disclosed the allowance. Nothing in
	// code supplies it, so an unknown bucket is one that has not been called.
	Known          bool   `json:"known"`
	Metered        bool   `json:"metered"`
	WindowDuration string `json:"window_duration,omitempty"`
	// Charges age out one at a time rather than at a window boundary, so what
	// there is to report is when the bucket stops refusing, not a reset instant.
	GatedUntil        string  `json:"gated_until,omitempty"`
	SecondsUntilOpen  float64 `json:"seconds_until_open,omitempty"`
	LastObservedAtUTC string  `json:"last_observed_at,omitempty"`
}

// Read is every bucket the fleet has learned about, sorted by name.
func Read(ctx context.Context, store *esiclient.Store, now time.Time) ([]BucketState, error) {
	buckets, err := store.Buckets(ctx)
	if err != nil {
		return nil, err
	}

	out := make([]BucketState, 0, len(buckets))
	for _, bucket := range buckets {
		state, err := store.State(ctx, bucket)
		if err != nil {
			return nil, err
		}
		out = append(out, describe(bucket, state, now))
	}
	return out, nil
}

func describe(bucket esiclient.Bucket, state esiclient.BucketState, now time.Time) BucketState {
	row := BucketState{
		Group:      bucket.Group,
		Scope:      esiclient.Scope(bucket),
		TokenLimit: state.Limit,
		TokenUsed:  state.Spent,
		Known:      state.Known(),
		Metered:    state.Metered,
	}
	if state.Window > 0 {
		row.WindowDuration = state.Window.String()
	}
	if state.Known() {
		row.TokenRemaining = max(state.Limit-state.Spent, 0)
		row.Fill = float64(row.TokenRemaining) / float64(state.Limit)
	}
	if !state.GatedUntil.IsZero() && state.GatedUntil.After(now) {
		row.GatedUntil = state.GatedUntil.UTC().Format(time.RFC3339)
		row.SecondsUntilOpen = state.GatedUntil.Sub(now).Seconds()
	}
	if !state.ObservedAt.IsZero() {
		row.LastObservedAtUTC = state.ObservedAt.UTC().Format(time.RFC3339)
	}
	return row
}
