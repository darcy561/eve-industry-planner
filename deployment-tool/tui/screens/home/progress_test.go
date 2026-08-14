package home

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"

	"eve-industry-planner/deployment-tool/tui/exec"
	"eve-industry-planner/deployment-tool/tui/pane"
)

func TestProgressMsgUpdatesOverlay(t *testing.T) {
	m := newModel()
	m.appendOut("log line")
	next, _ := m.Update(pane.ProgressMsg{Text: "Pulling 2 images\n  redis:8 …", Done: false})
	hm := next.(model)
	if hm.progressText == "" {
		t.Fatal("expected progress overlay")
	}
	if !strings.Contains(hm.pane.Text, "log line") {
		t.Fatalf("pane history cleared: %q", hm.pane.Text)
	}
	if strings.Contains(hm.pane.Text, "Pulling 2 images") {
		t.Fatal("live progress must not append to history until Done")
	}
}

func TestProgressMsgDoneCommitsToHistory(t *testing.T) {
	m := newModel()
	m.progressText = "stale overlay"
	next, _ := m.Update(pane.ProgressMsg{Text: "final board", Done: true})
	hm := next.(model)
	if hm.progressText != "" {
		t.Fatalf("overlay should clear: %q", hm.progressText)
	}
	if !strings.Contains(hm.pane.Text, "final board") {
		t.Fatalf("final board not committed: %q", hm.pane.Text)
	}
}

func TestProgressMsgDoneEmptyClearsOnly(t *testing.T) {
	m := newModel()
	m.appendOut("keep")
	m.progressText = "overlay"
	next, _ := m.Update(pane.ProgressMsg{Done: true})
	hm := next.(model)
	if hm.progressText != "" {
		t.Fatal("overlay not cleared")
	}
	if hm.pane.Text != "keep" {
		t.Fatalf("pane=%q", hm.pane.Text)
	}
}

func TestOnCLIDoneFlushesProgressOverlay(t *testing.T) {
	m := newModel()
	m.commandRunning = true
	m.progressText = "orphan board"
	f := 0.5
	m.progressFrac = &f
	next, _ := m.onCLIDone(exec.DoneMsg{})
	hm := next.(model)
	if hm.progressText != "" || hm.progressFrac != nil {
		t.Fatal("overlay should flush")
	}
	if !strings.Contains(hm.pane.Text, "orphan board") {
		t.Fatalf("expected flush into history: %q", hm.pane.Text)
	}
}

func TestProgressMsgSetsFraction(t *testing.T) {
	m := newModel()
	f := 0.4
	next, _ := m.Update(pane.ProgressMsg{Text: "board", Fraction: &f})
	hm := next.(model)
	if hm.progressFrac == nil || *hm.progressFrac != 0.4 {
		t.Fatalf("frac=%v", hm.progressFrac)
	}
	bar := hm.progressBar()
	if bar == nil || bar.State != tea.ProgressBarDefault || bar.Value != 40 {
		t.Fatalf("bar=%+v", bar)
	}
}

func TestProgressMsgIndeterminateWithoutFraction(t *testing.T) {
	m := newModel()
	next, _ := m.Update(pane.ProgressMsg{Text: "board"})
	hm := next.(model)
	bar := hm.progressBar()
	if bar == nil || bar.State != tea.ProgressBarIndeterminate {
		t.Fatalf("bar=%+v", bar)
	}
}

func TestProgressMsgDoneClearsBar(t *testing.T) {
	m := newModel()
	f := 0.9
	m.progressText = "x"
	m.progressFrac = &f
	next, _ := m.Update(pane.ProgressMsg{Done: true})
	hm := next.(model)
	if hm.progressBar() != nil {
		t.Fatal("bar should clear when done")
	}
}
