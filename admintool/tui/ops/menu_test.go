package ops_test

import (
	"os"
	"path/filepath"
	"testing"

	"eve-industry-planner/admintool/internal/kit"
	"eve-industry-planner/admintool/tui/ops"
	"eve-industry-planner/admintool/tui/status"
)

func writeOperatorKit(t *testing.T, home string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(home, kit.EnvFile), []byte("X=1\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(home, kit.ConfigFile), []byte("version: 1\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	for _, name := range kit.StackFiles {
		if err := os.WriteFile(filepath.Join(home, name), []byte("services: {}\n"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
}

func TestSetupNeeded(t *testing.T) {
	t.Parallel()
	home := t.TempDir()
	if !ops.SetupNeeded(home) {
		t.Fatal("empty home needs setup")
	}
	if err := os.WriteFile(filepath.Join(home, kit.EnvFile), []byte("X=1\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if !ops.SetupNeeded(home) {
		t.Fatal("env only still needs setup")
	}
	if err := os.WriteFile(filepath.Join(home, kit.ConfigFile), []byte("version: 1\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if !ops.SetupNeeded(home) {
		t.Fatal("docs without stacks still needs setup")
	}
	writeOperatorKit(t, home)
	if ops.SetupNeeded(home) {
		t.Fatal("docs + stacks present — setup not needed")
	}
}

func TestMainMenuOrderGreen(t *testing.T) {
	home := t.TempDir()
	t.Chdir(home)
	// Docs + stacks present → no Setup
	writeOperatorKit(t, ".")
	entries := ops.VisibleEntries(status.LightGreen)
	want := []string{"Status", "Start", "Dev", "Restart", "Rebuild", "Stop", "Update", "More"}
	if len(entries) != len(want) {
		t.Fatalf("len=%d want %d: %+v", len(entries), len(want), titles(entries))
	}
	for i, title := range want {
		if entries[i].Title != title {
			t.Fatalf("[%d]=%q want %q", i, entries[i].Title, title)
		}
	}
}

func TestMoreEntriesNoApplyRows(t *testing.T) {
	t.Parallel()
	for _, e := range ops.MoreEntries() {
		switch e.Title {
		case "Secrets", "Settings", "Logs", "Command":
		default:
			t.Fatalf("unexpected More row %q", e.Title)
		}
		if len(e.Args) > 0 {
			t.Fatalf("More rows are specials only, got Args on %q: %v", e.Title, e.Args)
		}
	}
}

func TestMoreGating(t *testing.T) {
	t.Parallel()
	off := ops.VisibleMoreEntries(status.LightOff)
	if !hasTitle(off, "Secrets") || !hasTitle(off, "Settings") || !hasTitle(off, "Command") {
		t.Fatalf("off more=%v", titles(off))
	}
	if hasTitle(off, "Logs") {
		t.Fatal("Logs must not show when Docker off")
	}
	green := ops.VisibleMoreEntries(status.LightGreen)
	if !hasTitle(green, "Logs") {
		t.Fatal("Logs on green")
	}
}

func TestStartStopArgs(t *testing.T) {
	t.Parallel()
	for _, e := range ops.Entries() {
		switch e.Title {
		case "Start":
			if len(e.Args) != 1 || e.Args[0] != "up" {
				t.Fatalf("Start args=%v", e.Args)
			}
		case "Stop":
			if len(e.Args) != 1 || e.Args[0] != "shutdown" {
				t.Fatalf("Stop args=%v", e.Args)
			}
		}
	}
}

func TestApplyDockerGateStartsAtTopAfterProbe(t *testing.T) {
	home := t.TempDir()
	t.Chdir(home)
	l, _ := ops.NewMenuList()
	ops.ApplyDockerGate(&l, status.LightGreen)
	cur, ok := ops.Selected(l)
	if !ok {
		t.Fatal("empty")
	}
	// With no docs, Setup is first; with docs Status is first.
	_ = cur
	writeOperatorKit(t, ".")
	ops.ApplyDockerGate(&l, status.LightGreen)
	cur, ok = ops.Selected(l)
	if !ok || cur.Title != "Status" {
		t.Fatalf("got %+v want Status", cur)
	}
}

func titles(entries []ops.Entry) []string {
	out := make([]string, len(entries))
	for i, e := range entries {
		out[i] = e.Title
	}
	return out
}

func hasTitle(entries []ops.Entry, title string) bool {
	for _, e := range entries {
		if e.Title == title {
			return true
		}
	}
	return false
}
