package home

import (
	"os"
	"strings"
	"testing"

	eipmsg "eve-industry-planner/admintool/internal/msg"
	"eve-industry-planner/admintool/internal/process"
	"eve-industry-planner/admintool/tui/exec"
)

func TestParseUpdateRestartMessage(t *testing.T) {
	t.Parallel()
	cases := []struct {
		in              string
		wantRelaunch    bool
		wantResume      bool
	}{
		{"restart-resume", true, true},
		{"  Restart-Resume  ", true, true},
		{"restart", true, false},
		{"RESTART", true, false},
		{"binary updated; restarting TUI", false, false},
		{"", false, false},
	}
	for _, tc := range cases {
		relaunch, resume := parseUpdateRestartMessage(tc.in)
		if relaunch != tc.wantRelaunch || resume != tc.wantResume {
			t.Fatalf("%q: got relaunch=%v resume=%v want %v/%v",
				tc.in, relaunch, resume, tc.wantRelaunch, tc.wantResume)
		}
	}
}

func TestApplyUpdateRestartMessageViaEvent(t *testing.T) {
	m := newModel()
	m.snap.StatusMsg = "update…"
	next, _ := m.Update(exec.EventMsg{Event: eipmsg.Event{
		Kind: eipmsg.KindStack, State: "update", Message: "restart-resume",
	}})
	hm := next.(model)
	if !hm.pendingRelaunch || !hm.pendingResumeUpdate {
		t.Fatalf("restart-resume: pendingRelaunch=%v pendingResumeUpdate=%v",
			hm.pendingRelaunch, hm.pendingResumeUpdate)
	}
	if hm.snap.StatusMsg != "update…" {
		t.Fatalf("control chip must not overwrite StatusMsg: %q", hm.snap.StatusMsg)
	}

	next, _ = hm.Update(exec.EventMsg{Event: eipmsg.Event{
		Kind: eipmsg.KindStack, State: "update", Message: "restart",
	}})
	hm = next.(model)
	if !hm.pendingRelaunch || hm.pendingResumeUpdate {
		t.Fatalf("restart should clear resume: relaunch=%v resume=%v",
			hm.pendingRelaunch, hm.pendingResumeUpdate)
	}
}

func TestResumeUpdateMsgClearsPane(t *testing.T) {
	m := newModel()
	m.appendOut("old output")
	next, _ := m.Update(resumeUpdateMsg{})
	hm := next.(model)
	// startCLI may fail without a real binary in PATH for tests — pane must still clear first.
	if strings.Contains(hm.pane.Text, "old output") {
		t.Fatalf("pane should clear on resume: %q", hm.pane.Text)
	}
	_ = next
}

func TestOnCLIDoneSchedulesRelaunchWithResume(t *testing.T) {
	m := newModel()
	m.pendingRelaunch = true
	m.pendingResumeUpdate = true
	m.commandRunning = true

	next, cmd := m.onCLIDone(exec.DoneMsg{})
	hm := next.(model)
	if hm.pendingRelaunch || hm.pendingResumeUpdate {
		t.Fatal("flags should clear before relaunch cmd runs")
	}
	if cmd == nil {
		t.Fatal("expected relaunch cmd")
	}
	if !strings.Contains(hm.pane.Text, "Restarting with new binary") {
		t.Fatalf("pane=%q", hm.pane.Text)
	}
	// Do not invoke cmd — it would RelaunchSelf / os.Exit.
}

func TestOnCLIDoneErrorClearsResumeFlags(t *testing.T) {
	m := newModel()
	m.pendingRelaunch = true
	m.pendingResumeUpdate = true
	m.commandRunning = true

	next, cmd := m.onCLIDone(exec.DoneMsg{Err: os.ErrInvalid})
	hm := next.(model)
	if hm.pendingRelaunch || hm.pendingResumeUpdate {
		t.Fatal("error should clear relaunch/resume")
	}
	if cmd == nil {
		t.Fatal("expected post-done probe/clear cmds")
	}
}

func TestResumeAfterBinaryCmd(t *testing.T) {
	t.Setenv(process.EnvUpdateResume, process.ValueTrue)
	cmd := resumeAfterBinaryCmd()
	if cmd == nil {
		t.Fatal("expected resume cmd")
	}
	if os.Getenv(process.EnvUpdateResume) != "" {
		t.Fatal("env should be cleared on take")
	}
	msg := cmd()
	if _, ok := msg.(resumeUpdateMsg); !ok {
		t.Fatalf("got %T", msg)
	}
	if resumeAfterBinaryCmd() != nil {
		t.Fatal("second take should be nil")
	}
}

func TestRelaunchOptsResumeEnv(t *testing.T) {
	t.Parallel()
	opts := relaunchOpts(true)
	if len(opts.ExtraEnv) != 1 || opts.ExtraEnv[0] != process.UpdateResumeEnv() {
		t.Fatalf("opts=%+v", opts)
	}
	if len(relaunchOpts(false).ExtraEnv) != 0 {
		t.Fatal("binary-only relaunch must not set resume env")
	}
}
