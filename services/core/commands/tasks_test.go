package commands

import (
	eipnats "eve-industry-planner/shared/nats"
	"strings"
	"testing"
)

// queueArchivedJobStatsRebuild queues accounts and then tells the operator to run
// the drain by name. A drain that is not triggerable leaves those accounts
// waiting for the next cron tick with no way to hurry it, and the advice the
// command prints would name a command that does not exist.
func TestDrainTaskIsTriggerable(t *testing.T) {
	t.Parallel()

	lookup := enabledTasksLowerLookup()
	task, ok := lookup["drainaccountstatsrebuildqueue"]
	if !ok {
		t.Fatal("drainAccountStatsRebuildQueue is not in the triggerable lookup; queueArchivedJobStatsRebuild tells operators to run it")
	}
	if task.Name != eipnats.DrainAccountStatsRebuildQueue.Name {
		t.Fatalf("lookup resolves to %q, want %q", task.Name, eipnats.DrainAccountStatsRebuildQueue.Name)
	}

	var listed bool
	for _, enabled := range enabledTasks {
		if enabled.Name == eipnats.DrainAccountStatsRebuildQueue.Name {
			listed = true
			break
		}
	}
	if !listed {
		t.Fatal("drainAccountStatsRebuildQueue is missing from enabledTasks, so `tasks list` does not advertise it")
	}

	if got := commandTaskName(eipnats.DrainAccountStatsRebuildQueue); got != "drainAccountStatsRebuildQueue" {
		t.Fatalf("commandTaskName = %q, want the name the usage text prints", got)
	}
}

// Every lookup key must resolve to a task that is also listed, or `tasks list`
// and the name a caller may type disagree.
func TestEnabledTaskLookupMatchesTheListedSet(t *testing.T) {
	t.Parallel()

	listed := make(map[string]bool, len(enabledTasks))
	for _, task := range enabledTasks {
		listed[task.Name] = true
	}
	for key, task := range enabledTasksLowerLookup() {
		if !listed[task.Name] {
			t.Fatalf("lookup key %q resolves to %q, which `tasks list` does not advertise", key, task.Name)
		}
		if key != strings.ToLower(key) {
			t.Fatalf("lookup key %q is not lowercase, so a case-insensitive match cannot find it", key)
		}
	}
}

// A mistyped command name reaches the trigger path, which has to name the typo.
// Blaming the next token instead sends the operator to debug the flag.
func TestUnknownCommandNamesItselfRatherThanBlamingAFlag(t *testing.T) {
	t.Parallel()

	err := runTrigger(t.Context(), []string{"queueArchivedJobsStatsRebuild", "-all"})
	if err == nil {
		t.Fatal("expected an error for an unknown command name")
	}
	msg := err.Error()
	if !strings.Contains(msg, "queueArchivedJobsStatsRebuild") {
		t.Fatalf("error does not name the unrecognised command: %s", msg)
	}
	if strings.Contains(msg, "unexpected extra argument") {
		t.Fatalf("error blames the flag rather than the command name: %s", msg)
	}
}

// A real task name must still reach the trigger path; the guard rejects unknown
// names only, not every non-flag token.
func TestKnownTaskPassesTheNameGuard(t *testing.T) {
	t.Parallel()

	// Fails on connecting to NATS rather than on the name, which is enough to
	// show the guard let it through.
	err := runTrigger(t.Context(), []string{"drainAccountStatsRebuildQueue"})
	if err != nil && strings.Contains(err.Error(), "unknown command or task") {
		t.Fatalf("a listed task was rejected by the name guard: %v", err)
	}
}
