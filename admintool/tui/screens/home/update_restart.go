package home

import (
	"strings"

	tea "charm.land/bubbletea/v2"

	"eve-industry-planner/admintool/internal/kit"
	"eve-industry-planner/admintool/internal/process"
)

// parseUpdateRestartMessage maps an update-stack chip message to relaunch flags.
// restart-resume → relaunch TUI then auto-run update; restart → relaunch only.
func parseUpdateRestartMessage(message string) (relaunch, resume bool) {
	switch strings.ToLower(strings.TrimSpace(message)) {
	case "restart-resume":
		return true, true
	case "restart":
		return true, false
	default:
		return false, false
	}
}

// isUpdateControlMessage is a parent-only signal (not operator StatusMsg text).
func isUpdateControlMessage(message string) bool {
	relaunch, _ := parseUpdateRestartMessage(message)
	return relaunch
}

func (m *model) applyUpdateRestartMessage(message string) {
	relaunch, resume := parseUpdateRestartMessage(message)
	if !relaunch {
		return
	}
	m.pendingRelaunch = true
	m.pendingResumeUpdate = resume
}

// resumeAfterBinaryCmd returns a cmd that starts update when EIP_UPDATE_RESUME was set.
// Clears the env on read so a later manual TUI start does not resume.
func resumeAfterBinaryCmd() tea.Cmd {
	if !process.TakeUpdateResume() {
		return nil
	}
	return func() tea.Msg { return resumeUpdateMsg{} }
}

func relaunchOpts(resumeUpdate bool) kit.RelaunchOpts {
	opts := kit.RelaunchOpts{}
	if resumeUpdate {
		opts.ExtraEnv = []string{process.UpdateResumeEnv()}
	}
	return opts
}
