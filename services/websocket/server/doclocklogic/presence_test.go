package doclocklogic

import (
	"context"
	"eve-industry-planner/shared/models"
	"testing"

	"eve-industry-planner/shared/core/documentlock"
	"eve-industry-planner/testing/redisfake"

	eipredis "eve-industry-planner/shared/redis"
)

func TestWaitlistPulseNilRedis(t *testing.T) {
	t.Parallel()
	out := WaitlistPulse(context.Background(), documentlock.Deps{}, models.AccountOwner("a"), "s", "jobs", "j1")
	if out.OK() || out.FailureClass != documentlock.FailureUnavailable {
		t.Fatalf("%+v", out)
	}
}

func TestWaitlistPulseOK(t *testing.T) {
	t.Parallel()
	rdb := eipredis.NewRedis(redisfake.New(t).Client)

	out := WaitlistPulse(context.Background(), documentlock.Deps{Redis: rdb}, models.AccountOwner("acct"), "sess", "jobs", "j1")
	if !out.OK() {
		t.Fatalf("%+v", out)
	}
	key := documentlock.WaitlistPulseKey(models.AccountOwner("acct"), "jobs", "j1", "sess")
	if got, err := rdb.Driver().Get(context.Background(), key).Result(); err != nil || got != "1" {
		t.Fatalf("pulse key=%q err=%v", got, err)
	}
}
