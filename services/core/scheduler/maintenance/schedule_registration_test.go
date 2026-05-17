package maintenance

import (
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

func TestScheduleCloudStoredEsiRefreshMaintenance_RegistersCron(t *testing.T) {
	t.Parallel()
	s := newRecordingScheduler()
	_, err := ScheduleCloudStoredEsiRefreshMaintenance(contract.Dependencies{}, s)
	if err != nil {
		t.Fatal(err)
	}
	if len(s.crons) != 1 {
		t.Fatalf("expected 1 cron, got %d", len(s.crons))
	}
	if s.crons[0].expr != "*/10 * * * *" || s.crons[0].jobName != "cron.cloudStoredEsiRefreshMaintenance" {
		t.Fatalf("unexpected cron: %+v", s.crons[0])
	}
	if _, ok := s.handlers["cron.cloudStoredEsiRefreshMaintenance"]; !ok {
		t.Fatal("handler not registered")
	}
}

func TestScheduleInactiveAccountPlannerCleanup_RegistersCron(t *testing.T) {
	t.Parallel()
	s := newRecordingScheduler()
	_, err := ScheduleInactiveAccountPlannerCleanup(contract.Dependencies{}, s)
	if err != nil {
		t.Fatal(err)
	}
	if len(s.crons) != 1 {
		t.Fatalf("expected 1 cron, got %d", len(s.crons))
	}
	if s.crons[0].expr != "0 8 * * 1" || s.crons[0].jobName != "cron.inactiveAccountPlannerCleanup" {
		t.Fatalf("unexpected cron: %+v", s.crons[0])
	}
	if _, ok := s.handlers["cron.inactiveAccountPlannerCleanup"]; !ok {
		t.Fatal("handler not registered")
	}
}

func TestSchedulePruneExpiredAccountSessions_RegistersCron(t *testing.T) {
	t.Parallel()
	s := newRecordingScheduler()
	_, err := SchedulePruneExpiredAccountSessions(contract.Dependencies{}, s)
	if err != nil {
		t.Fatal(err)
	}
	if len(s.crons) != 1 {
		t.Fatalf("expected 1 cron, got %d", len(s.crons))
	}
	if s.crons[0].expr != "0 */4 * * *" || s.crons[0].jobName != "cron.pruneExpiredAccountSessions" {
		t.Fatalf("unexpected cron: %+v", s.crons[0])
	}
	if _, ok := s.handlers["cron.pruneExpiredAccountSessions"]; !ok {
		t.Fatal("handler not registered")
	}
}
