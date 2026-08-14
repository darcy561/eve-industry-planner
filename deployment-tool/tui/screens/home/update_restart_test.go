package home

import (
	"os"
	"strings"
	"testing"

	eipmsg "eve-industry-planner/deployment-tool/internal/msg"
	"eve-industry-planner/deployment-tool/internal/process"
	"eve-industry-planner/deployment-tool/tui/exec"
	"eve-industry-planner/deployment-tool/tui/ops"
)

func TestParseUpdateRestartMessage(t *testing.T) {
	t.Parallel()
	cases := []struct {
		in           string
		wantRelaunch bool
		wantResume   bool
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
	t.Cleanup(func() { reapTestCLI(hm.stream) })
	// Resume clears the pane before startCLIForced; child is os.Executable() under go test.
	if strings.Contains(hm.pane.Text, "old output") {
		t.Fatalf("pane should clear on resume: %q", hm.pane.Text)
	}
}

func TestResumeUpdateMsgBypassesDockerGate(t *testing.T) {
	m := newModel()
	entry := ops.Entry{Title: "update", Args: []string{"update"}}
	if ops.Allowed(entry, m.snap.Docker, m.snap.Health) {
		t.Fatal("precondition: update should be gated when Docker is off")
	}
	next, _ := m.Update(resumeUpdateMsg{})
	hm := next.(model)
	t.Cleanup(func() { reapTestCLI(hm.stream) })
	if !strings.Contains(hm.pane.Text, "Running update") {
		t.Fatalf("resume must force-start update when Docker off: pane=%q running=%v",
			hm.pane.Text, hm.commandRunning)
	}
}

// reapTestCLI kills a child started by startCLIForced and drains until DoneMsg so
// Windows can unlink the go-test binary after the package finishes.
func reapTestCLI(s *exec.Stream) {
	if s == nil {
		return
	}
	s.Kill()
	for {
		msg := s.WaitCmd()()
		if msg == nil {
			return
		}
		if _, ok := msg.(exec.DoneMsg); ok {
			return
		}
	}
}

func TestOnCLIDoneSchedulesRelaunchWithResume(t *testing.T) {
	m := newModel()
	m.pendingRelaunch = true
	m.pendingResumeUpdate = true
	m.commandRunning = true

	next, cmd := m.onCLIDone(exec.DoneMsg{})
	hm := next.(model)
	if hm.pendingRelaunch || hm.pendingResumeUpdate {
		t.Fatal("pending flags should clear before quit")
	}
	if !hm.relaunchOnExit || !hm.relaunchResume {
		t.Fatalf("relaunchOnExit=%v relaunchResume=%v", hm.relaunchOnExit, hm.relaunchResume)
	}
	if cmd == nil {
		t.Fatal("expected tea.Quit")
	}
	if !strings.Contains(hm.pane.Text, "Restarting with new binary") {
		t.Fatalf("pane=%q", hm.pane.Text)
	}
	// Run() calls RelaunchSelfOpts after tea exits — do not invoke here (os.Exit).
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
	if hm.relaunchOnExit {
		t.Fatal("error must not arm relaunchOnExit")
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
