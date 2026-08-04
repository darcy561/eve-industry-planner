package doclocklogic

import (
	"context"
	"testing"

	"eve-industry-planner/shared/core/documentlock"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
)

func TestWaitlistPulseNilRedis(t *testing.T) {
	t.Parallel()
	out := WaitlistPulse(context.Background(), documentlock.Deps{}, "a", "s", "jobs", "j1")
	if out.OK() || out.FailureClass != documentlock.FailureUnavailable {
		t.Fatalf("%+v", out)
	}
}

func TestWaitlistPulseOK(t *testing.T) {
	t.Parallel()
	mr := miniredis.RunT(t)
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { _ = rdb.Close() })

	out := WaitlistPulse(context.Background(), documentlock.Deps{Redis: rdb}, "acct", "sess", "jobs", "j1")
	if !out.OK() {
		t.Fatalf("%+v", out)
	}
	key := documentlock.WaitlistPulseKey("acct", "jobs", "j1", "sess")
	if got, err := rdb.Get(context.Background(), key).Result(); err != nil || got != "1" {
		t.Fatalf("pulse key=%q err=%v", got, err)
	}
}
