package home

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"

	"eve-industry-planner/deployment-tool/internal/kit"
	"eve-industry-planner/deployment-tool/tui/status"
	"eve-industry-planner/deployment-tool/tui/ui"
)

func stubStacks(t *testing.T, home string) {
	t.Helper()
	for _, name := range kit.StackFiles {
		if err := os.WriteFile(filepath.Join(home, name), []byte("services: {}\n"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
}

func TestOpenSecretsAndSettingsBuilders(t *testing.T) {
	home := t.TempDir()
	t.Chdir(home)
	stubStacks(t, home)

	m := readyHome(t)
	m.openSecretsBuilder()
	if m.bodyMode != bodyModeBuilder || m.docKind != docEnvEdit {
		t.Fatalf("secrets: mode=%v kind=%v", m.bodyMode, m.docKind)
	}
	if m.builder.Title != "SECRETS" {
		t.Fatalf("title=%q", m.builder.Title)
	}

	m.openSettingsBuilder()
	if m.docKind != docConfigEdit || m.builder.Title != "SETTINGS" {
		t.Fatalf("settings: kind=%v title=%q", m.docKind, m.builder.Title)
	}
}

func TestCloseBuilderReturnsToMore(t *testing.T) {
	home := t.TempDir()
	t.Chdir(home)
	stubStacks(t, home)

	m := readyHome(t)
	m.fromMore = true
	m.openSecretsBuilder()
	next, _ := m.closeBuilder()
	hm := next.(model)
	if hm.bodyMode != bodyModeOps {
		t.Fatalf("mode=%v", hm.bodyMode)
	}
	if hm.focus != focusMore {
		t.Fatalf("focus=%v want More", hm.focus)
	}
	if hm.docKind != docNone {
		t.Fatalf("docKind=%v", hm.docKind)
	}
}

func TestOnBuilderDoneEnvSetupOpensChoice(t *testing.T) {
	home := t.TempDir()
	t.Chdir(home)
	stubStacks(t, home)

	m := readyHome(t)
	m.openEnvBuilder("SETUP", docEnvSetup)
	next, _ := m.onBuilderDone()
	hm := next.(model)
	if hm.bodyMode != bodyModeSetupChoice {
		t.Fatalf("mode=%v", hm.bodyMode)
	}
	if _, err := os.Stat(filepath.Join(home, kit.EnvFile)); err != nil {
		t.Fatalf(".env not written: %v", err)
	}
	if !strings.Contains(hm.pane.Text, "Env saved") {
		t.Fatalf("pane=%q", hm.pane.Text)
	}
}

func TestOnBuilderDonePersistError(t *testing.T) {
	home := t.TempDir()
	t.Chdir(home)
	// Block .env write: path exists as a directory.
	if err := os.Mkdir(filepath.Join(home, kit.EnvFile), 0o755); err != nil {
		t.Fatal(err)
	}

	m := readyHome(t)
	m.openEnvBuilder("SECRETS", docEnvEdit)
	next, _ := m.onBuilderDone()
	hm := next.(model)
	if hm.bodyMode != bodyModeBuilder {
		t.Fatalf("should stay in builder, mode=%v", hm.bodyMode)
	}
	if hm.builder.FinishError() == "" {
		t.Fatal("want finish error on persist failure")
	}
}

func TestOnBuilderDoneSecretsApplyWhenStackOff(t *testing.T) {
	home := t.TempDir()
	t.Chdir(home)
	stubStacks(t, home)

	m := readyHome(t)
	m.snap.Health = status.LightOff
	m.snap.Docker = status.LightGreen
	m.fromMore = true
	m.openEnvBuilder("SECRETS", docEnvEdit)
	next, cmd := m.onBuilderDone()
	hm := next.(model)
	if cmd != nil {
		t.Fatal("no CLI when stack off")
	}
	if hm.bodyMode != bodyModeOps {
		t.Fatalf("mode=%v", hm.bodyMode)
	}
	if !strings.Contains(hm.pane.Text, "Start or Dev") {
		t.Fatalf("pane=%q", hm.pane.Text)
	}
	if hm.focus != focusMore {
		t.Fatalf("focus=%v", hm.focus)
	}
}

func TestPlanDocApplyQueuesSecretsAndSync(t *testing.T) {
	m := readyHome(t)
	m.snap.Health = status.LightGreen
	m.snap.Docker = status.LightGreen
	jobs, note, start := m.planDocApply(true, false)
	if !start || len(jobs) != 2 || jobs[0].Label != "secrets" || jobs[1].Label != "sync" {
		t.Fatalf("jobs=%v start=%v", jobs, start)
	}
	if !strings.Contains(note, "secrets") {
		t.Fatalf("note=%q", note)
	}
	jobs, note, start = m.planDocApply(false, false)
	if !start || len(jobs) != 1 || jobs[0].Label != "sync" {
		t.Fatalf("sync-only jobs=%v", jobs)
	}
	if !strings.Contains(note, "sync") {
		t.Fatalf("note=%q", note)
	}
}

func TestPlanDocApplyObservabilityChangeQueuesRepair(t *testing.T) {
	m := readyHome(t)
	m.snap.Health = status.LightGreen
	m.snap.Docker = status.LightGreen
	jobs, note, start := m.planDocApply(false, true)
	if !start || len(jobs) != 2 || jobs[0].Label != "sync" || jobs[1].Label != "repair" {
		t.Fatalf("jobs=%v start=%v", jobs, start)
	}
	if !strings.Contains(note, "observability") {
		t.Fatalf("note=%q", note)
	}
}

func TestAfterDocApplyDockerNotReady(t *testing.T) {
	m := readyHome(t)
	m.snap.Health = status.LightGreen
	m.snap.Docker = status.LightRed
	next, cmd := m.afterDocApply(false, false)
	hm := next.(model)
	if cmd != nil || hm.commandRunning {
		t.Fatal("must not start CLI")
	}
	if !strings.Contains(hm.pane.Text, "Docker is ready") {
		t.Fatalf("pane=%q", hm.pane.Text)
	}
}

func TestSetupChoiceDefaultsAndAdvanced(t *testing.T) {
	home := t.TempDir()
	t.Chdir(home)
	stubStacks(t, home)

	m := readyHome(t)
	m.openEnvBuilder("SETUP", docEnvSetup)
	next, _ := m.onBuilderDone()
	hm := next.(model)

	// Esc pauses setup.
	next, _ = hm.updateSetupChoice(tea.KeyPressMsg{Code: tea.KeyEsc})
	hm = next.(model)
	if hm.bodyMode != bodyModeOps {
		t.Fatalf("esc mode=%v", hm.bodyMode)
	}

	// Re-enter choice via env setup Persist.
	m = readyHome(t)
	m.openEnvBuilder("SETUP", docEnvSetup)
	next, _ = m.onBuilderDone()
	hm = next.(model)
	hm.list.Select(1) // Use defaults (0 is ← Back)
	hm.snap.Health = status.LightOff
	next, _ = hm.activateSetupChoice()
	hm = next.(model)
	if _, err := os.Stat(filepath.Join(home, kit.ConfigFile)); err != nil {
		t.Fatalf("config: %v", err)
	}
	if hm.bodyMode != bodyModeOps {
		t.Fatalf("defaults mode=%v", hm.bodyMode)
	}

	// Advanced opens config builder.
	m = readyHome(t)
	m.openEnvBuilder("SETUP", docEnvSetup)
	next, _ = m.onBuilderDone()
	hm = next.(model)
	// Select Advanced
	for i := 0; i < len(hm.list.Items()); i++ {
		hm.list.Select(i)
		if item, ok := ui.SelectedItem(hm.list); ok && item.Title() == choiceConfigAdvanced {
			break
		}
	}
	next, _ = hm.activateSetupChoice()
	hm = next.(model)
	if hm.bodyMode != bodyModeBuilder || hm.docKind != docConfigSetup {
		t.Fatalf("advanced: mode=%v kind=%v", hm.bodyMode, hm.docKind)
	}
}

func TestUpdateSetupChoiceEnter(t *testing.T) {
	home := t.TempDir()
	t.Chdir(home)
	stubStacks(t, home)

	m := readyHome(t)
	m.openEnvBuilder("SETUP", docEnvSetup)
	next, _ := m.onBuilderDone()
	hm := next.(model)
	hm.snap.Health = status.LightOff
	hm.list.Select(1) // Use defaults
	next, _ = hm.updateSetupChoice(tea.KeyPressMsg{Code: tea.KeyEnter})
	hm = next.(model)
	if hm.bodyMode != bodyModeOps {
		t.Fatalf("enter defaults → mode=%v", hm.bodyMode)
	}
}
