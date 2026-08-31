package archivedjobs

import (
	eipnats "eve-industry-planner/shared/nats"
	"strings"
	"testing"

	"eve-industry-planner/core/scheduler/contract"
)

type recordingScheduler struct {
	handlers map[string]contract.TaskHandler
	crons    []struct {
		expr, jobName string
	}
}

func newRecordingScheduler() *recordingScheduler {
	return &recordingScheduler{handlers: make(map[string]contract.TaskHandler)}
}

func (r *recordingScheduler) RegisterHandler(taskType string, handler contract.TaskHandler) {
	r.handlers[taskType] = handler
}

func (r *recordingScheduler) HasScheduledJob(taskType string) bool {
	_, ok := r.handlers[taskType]
	return ok
}

func (r *recordingScheduler) ScheduleCronJob(cronExpr, taskType string) error {
	r.crons = append(r.crons, struct {
		expr, jobName string
	}{expr: cronExpr, jobName: taskType})
	return nil
}

func TestScheduleDrainAccountStatsRebuildQueue_RegistersCron(t *testing.T) {
	t.Parallel()
	s := newRecordingScheduler()
	_, err := ScheduleDrainAccountStatsRebuildQueue(contract.Dependencies{}, s)
	if err != nil {
		t.Fatal(err)
	}
	if len(s.crons) != 1 {
		t.Fatalf("expected 1 cron, got %d", len(s.crons))
	}
	if s.crons[0].expr != "30 * * * *" || s.crons[0].jobName != "cron.drainAccountStatsRebuildQueue" {
		t.Fatalf("unexpected cron: %+v", s.crons[0])
	}
	if _, ok := s.handlers["cron.drainAccountStatsRebuildQueue"]; !ok {
		t.Fatal("handler not registered")
	}
}

// The drain runs off the hour so it does not start alongside every other cron
// that fires on minute 0.
func TestDrainCronRunsOffTheHour(t *testing.T) {
	t.Parallel()
	if strings.HasPrefix(cronDrainAccountStatsRebuildQueueSchedule, "0 ") {
		t.Fatalf("drain cron fires on minute 0 (%q), alongside the rest of the hourly crons", cronDrainAccountStatsRebuildQueueSchedule)
	}
}

// The cron publishes to whatever subject the task declares, so a task renamed
// without updating its registration would publish to a subject no handler is
// bound to and the queue would silently stop draining.
func TestDrainCronPublishesTheDeclaredTaskSubject(t *testing.T) {
	t.Parallel()
	task := eipnats.DrainAccountStatsRebuildQueue
	if task.Subject != "task.scheduled.drainAccountStatsRebuildQueue" {
		t.Fatalf("task subject = %q; the worker handler binding must be updated to match", task.Subject)
	}
	if task.DefaultPriority == "" {
		t.Fatal("task has no default priority, so the cron would publish without one")
	}
}
