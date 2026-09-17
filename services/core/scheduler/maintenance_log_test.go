package scheduler

import (
	"context"
	"encoding/json/jsontext"
	"sync/atomic"
	"testing"

	"eve-industry-planner/shared/logs"
	"eve-industry-planner/testing/redisfake"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
	"go.uber.org/zap/zaptest/observer"

	eipredis "eve-industry-planner/shared/redis"
)

// observedFire runs one cron fire against a captured logger and reports what it
// logged. Calling the job function directly keeps the assertion on one fire
// rather than on whatever the scheduler happened to run.
func observedFire(t *testing.T, s *TaskScheduler, taskType string) (*observer.ObservedLogs, *atomic.Int32) {
	t.Helper()
	var ran atomic.Int32
	s.registerHandler(taskType, func(context.Context, jsontext.Value) error {
		ran.Add(1)
		return nil
	})

	core, recorded := observer.New(zapcore.DebugLevel)
	ctx := logs.ContextWithLogger(context.Background(), zap.New(core))
	s.cronJobFunc("@every 1h", taskType)(ctx)
	return recorded, &ran
}

// A skipped fire says so: a window that silently stops publishing leaves an
// operator with no way to tell it apart from a scheduler that has died.
func TestSkippedCronFireLogsTheSkip(t *testing.T) {
	r := redisfake.New(t)

	s, err := NewTaskScheduler(nil, eipredis.NewRedis(r.Client))
	if err != nil {
		t.Fatal(err)
	}
	if err := s.maintenance.Set(context.Background(), true); err != nil {
		t.Fatalf("set: %v", err)
	}

	recorded, ran := observedFire(t, s, "refreshRegionMarketOrders")
	if ran.Load() != 0 {
		t.Fatal("the handler ran during maintenance")
	}

	entries := recorded.FilterMessage("cron job skipped during maintenance").All()
	if len(entries) != 1 {
		t.Fatalf("logged the skip %d times, want 1 (all: %v)", len(entries), recorded.All())
	}
	if entries[0].Level != zapcore.InfoLevel {
		t.Errorf("skip logged at %s, want info: an operator reads this at the default level", entries[0].Level)
	}

	// The fields are what make the line useful: which job did not run.
	fields := entries[0].ContextMap()
	if fields["task_type"] != "refreshRegionMarketOrders" {
		t.Errorf("task_type = %v, want the job that was skipped", fields["task_type"])
	}
	if fields["component"] != schedulerLogComponent {
		t.Errorf("component = %v, want %q", fields["component"], schedulerLogComponent)
	}
	if fields["cron_expr"] == nil || fields["job_id"] == nil {
		t.Errorf("skip line is missing cron_expr or job_id: %v", fields)
	}
}

// Without a window there is no skip line, so the message cannot be read as
// routine noise when it does appear.
func TestNormalCronFireLogsNoSkip(t *testing.T) {
	r := redisfake.New(t)

	s, err := NewTaskScheduler(nil, eipredis.NewRedis(r.Client))
	if err != nil {
		t.Fatal(err)
	}

	recorded, ran := observedFire(t, s, "refreshRegionMarketOrders")
	if ran.Load() != 1 {
		t.Fatalf("the handler ran %d times, want 1", ran.Load())
	}
	if n := recorded.FilterMessage("cron job skipped during maintenance").Len(); n != 0 {
		t.Errorf("logged %d skips with maintenance off, want 0", n)
	}
}
