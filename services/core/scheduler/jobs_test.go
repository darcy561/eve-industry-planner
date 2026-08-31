package scheduler

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"eve-industry-planner/core/scheduler/contract"

	"github.com/robfig/cron/v3"
)

func TestDeclaredJobsAreWellFormed(t *testing.T) {
	t.Parallel()
	parser := cron.NewParser(cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow)
	seen := make(map[string]bool, len(jobs))

	for _, job := range jobs {
		if !strings.HasPrefix(job.Name, "cron.") {
			t.Errorf("job %q does not carry the cron. prefix", job.Name)
		}
		if seen[job.Name] {
			t.Errorf("job %q is declared twice", job.Name)
		}
		seen[job.Name] = true

		if _, err := parser.Parse(job.Expr); err != nil {
			t.Errorf("job %s has an unparseable expression %q: %v", job.Name, job.Expr, err)
		}
		if job.Build == nil {
			t.Fatalf("job %s has no builder", job.Name)
		}
		if job.Build(contract.Dependencies{}, job.Name) == nil {
			t.Errorf("job %s built a nil handler", job.Name)
		}
	}
}

// A declaration is the only way a job exists: it is registered and scheduled from
// the same entry, so neither half can name something the other does not.
func TestEveryDeclaredJobIsRegisteredAndScheduled(t *testing.T) {
	t.Parallel()
	s := newSchedulerWithDeclaredJobs(t)

	if len(s.handlers) != len(jobs) {
		t.Fatalf("registered %d handlers for %d declared jobs", len(s.handlers), len(jobs))
	}
	for _, job := range jobs {
		if _, ok := s.handlers[job.Name]; !ok {
			t.Errorf("declared job %s has no handler", job.Name)
		}
	}

	scheduled := s.scheduler.Jobs()
	if len(scheduled) != len(jobs) {
		t.Fatalf("scheduled %d cron jobs for %d declared jobs", len(scheduled), len(jobs))
	}
	tags := make(map[string]bool, len(scheduled))
	for _, sj := range scheduled {
		for _, tag := range sj.Tags() {
			tags[tag] = true
		}
	}
	for _, job := range jobs {
		if !tags["cron:"+job.Name] {
			t.Errorf("declared job %s was not scheduled", job.Name)
		}
	}
}

func TestSchedulingAnUnregisteredJobIsAnError(t *testing.T) {
	t.Parallel()
	s := newSchedulerWithDeclaredJobs(t)

	if err := s.scheduleCronJob("*/5 * * * *", "cron.notDeclared"); err == nil {
		t.Fatal("scheduling a job with no handler was accepted")
	}
}

func newSchedulerWithDeclaredJobs(t *testing.T) *TaskScheduler {
	t.Helper()
	s, err := NewTaskScheduler(nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	deps := contract.Dependencies{}
	for _, job := range jobs {
		s.registerHandler(job.Name, job.Build(deps, job.Name))
		if err := s.scheduleCronJob(job.Expr, job.Name); err != nil {
			t.Fatalf("schedule %s: %v", job.Name, err)
		}
	}
	return s
}

var _ contract.TaskHandler = func(context.Context, json.RawMessage) error { return nil }
