package scheduler

import (
	"context"
	"encoding/json/jsontext"
	"sync/atomic"
	"testing"
	"time"

	"eve-industry-planner/testing/redisfake"
	"eve-industry-planner/testing/wait"

	"github.com/go-co-op/gocron/v2"

	eipredis "eve-industry-planner/shared/redis"
)

// fireCron schedules taskType to fire every 100ms and starts the scheduler, so a
// test can watch what the next fire does.
func fireCron(t *testing.T, s *TaskScheduler, taskType string, ran *atomic.Int32) {
	t.Helper()
	s.registerHandler(taskType, func(context.Context, jsontext.Value) error {
		ran.Add(1)
		return nil
	})
	if _, err := s.scheduler.NewJob(
		gocron.DurationJob(100*time.Millisecond),
		gocron.NewTask(s.cronJobFunc("@every 100ms", taskType)),
	); err != nil {
		t.Fatalf("schedule: %v", err)
	}
	if err := s.Start(); err != nil {
		t.Fatalf("start: %v", err)
	}
	t.Cleanup(s.Stop)
}

// A fire during maintenance publishes nothing: the handler is what publishes, so
// not reaching it is what stops work entering the queues.
func TestCronFireDuringMaintenancePublishesNothing(t *testing.T) {
	r := redisfake.New(t)

	s, err := NewTaskScheduler(nil, eipredis.NewRedis(r.Client))
	if err != nil {
		t.Fatal(err)
	}
	if err := s.maintenance.Set(context.Background(), true); err != nil {
		t.Fatalf("set: %v", err)
	}

	var ran atomic.Int32
	fireCron(t, s, "refreshRegionMarketOrders", &ran)

	time.Sleep(400 * time.Millisecond)
	if got := ran.Load(); got != 0 {
		t.Fatalf("the handler ran %d times during maintenance, want 0", got)
	}
}

// Clearing the flag resumes publishing on the next fire, with no restart: the
// job stayed registered and scheduled throughout.
func TestCronResumesAfterMaintenanceClearsWithoutARestart(t *testing.T) {
	r := redisfake.New(t)
	ctx := context.Background()

	s, err := NewTaskScheduler(nil, eipredis.NewRedis(r.Client))
	if err != nil {
		t.Fatal(err)
	}
	if err := s.maintenance.Set(ctx, true); err != nil {
		t.Fatalf("set: %v", err)
	}

	var ran atomic.Int32
	fireCron(t, s, "refreshRegionMarketOrders", &ran)

	time.Sleep(300 * time.Millisecond)
	if ran.Load() != 0 {
		t.Fatalf("the handler ran during maintenance")
	}

	if err := s.maintenance.Set(ctx, false); err != nil {
		t.Fatalf("clear: %v", err)
	}
	wait.For(t, 3*time.Second, func() (bool, string) {
		return ran.Load() > 0, "waiting for the next fire to publish"
	})
}

// Maintenance off is the ordinary path: the gate must not stop work when there
// is no window.
func TestCronRunsNormallyWithoutMaintenance(t *testing.T) {
	r := redisfake.New(t)

	s, err := NewTaskScheduler(nil, eipredis.NewRedis(r.Client))
	if err != nil {
		t.Fatal(err)
	}

	var ran atomic.Int32
	fireCron(t, s, "refreshRegionMarketOrders", &ran)

	wait.For(t, 3*time.Second, func() (bool, string) {
		return ran.Load() > 0, "waiting for a normal fire"
	})
}

// The scheduler is constructed with nil clients in tests and in wiring that has
// no Redis; the gate must read as off rather than block every job.
func TestCronRunsWhenNoFlagIsWired(t *testing.T) {

	s, err := NewTaskScheduler(nil, nil)
	if err != nil {
		t.Fatal(err)
	}

	var ran atomic.Int32
	fireCron(t, s, "refreshRegionMarketOrders", &ran)

	wait.For(t, 3*time.Second, func() (bool, string) {
		return ran.Load() > 0, "waiting for a fire with no flag wired"
	})
}

// The flag is read at each fire, not captured when the job was scheduled.
func TestCronReadsTheFlagAtEachFire(t *testing.T) {
	r := redisfake.New(t)
	ctx := context.Background()

	s, err := NewTaskScheduler(nil, eipredis.NewRedis(r.Client))
	if err != nil {
		t.Fatal(err)
	}

	var ran atomic.Int32
	fireCron(t, s, "refreshRegionMarketOrders", &ran)

	wait.For(t, 3*time.Second, func() (bool, string) {
		return ran.Load() > 0, "waiting for the first fire"
	})

	if err := s.maintenance.Set(ctx, true); err != nil {
		t.Fatalf("set: %v", err)
	}
	settled := ran.Load()
	time.Sleep(400 * time.Millisecond)
	if got := ran.Load(); got != settled {
		t.Errorf("the handler ran %d more times after maintenance started", got-settled)
	}
}
