package commands

import (
	"strings"
	"testing"
)

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
	err := runTrigger(t.Context(), []string{"dispatchStatisticsRebuilds"})
	if err != nil && strings.Contains(err.Error(), "unknown command or task") {
		t.Fatalf("a listed task was rejected by the name guard: %v", err)
	}
}
