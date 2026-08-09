package harness_test

import (
	"context"
	"testing"
	"time"

	"eve-industry-planner/testing/harness"
)

func TestPollUntilSucceeds(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	n := 0
	err := harness.PollUntil(ctx, harness.PollOptions{Every: 10 * time.Millisecond}, func(context.Context) (bool, string, error) {
		n++
		return n >= 3, "n", nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

func TestPollUntilAliveFails(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	err := harness.PollUntil(ctx, harness.PollOptions{
		Every: 10 * time.Millisecond,
		Alive: func() error { return context.Canceled },
	}, func(context.Context) (bool, string, error) {
		return false, "waiting", nil
	})
	if err == nil {
		t.Fatal("expected alive error")
	}
}
