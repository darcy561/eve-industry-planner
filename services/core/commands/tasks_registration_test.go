package commands

import (
	"strings"
	"testing"
)

// The lookup is derived from the allowlist, so a task cannot be runnable but
// unfindable, or findable under a name the list does not offer.
func TestEnabledTasksAreAllFindableByTheirCommandName(t *testing.T) {
	t.Parallel()

	lookup := enabledTasksLowerLookup()
	if len(lookup) != len(enabledTasks) {
		t.Fatalf("lookup holds %d entries for %d enabled tasks — two share a command name",
			len(lookup), len(enabledTasks))
	}

	for _, task := range enabledTasks {
		name := commandTaskName(task)
		found, ok := lookup[strings.ToLower(name)]
		if !ok {
			t.Errorf("task %q is enabled but not findable as %q", task.Name, name)
			continue
		}
		if found.Name != task.Name {
			t.Errorf("%q resolves to %q, want %q", name, found.Name, task.Name)
		}
	}
}

func TestCommandTaskNameFallsBackToTheTaskName(t *testing.T) {
	t.Parallel()

	for _, task := range enabledTasks {
		if _, renamed := commandTaskNames[task.Name]; renamed {
			continue
		}
		if got := commandTaskName(task); got != task.Name {
			t.Errorf("commandTaskName(%q) = %q, want the task's own name", task.Name, got)
		}
	}
}
