package home

import (
	tea "charm.land/bubbletea/v2"

	"eve-industry-planner/deployment-tool/tui/ops"
	"eve-industry-planner/deployment-tool/tui/ui"

	statusbar "eve-industry-planner/deployment-tool/tui/status"
)

func (m model) handleMouse(msg tea.MouseMsg) (tea.Model, tea.Cmd) {
	if m.bodyMode == bodyModeBuilder {
		var cmd tea.Cmd
		m.builder, cmd = m.builder.HandleMouse(msg)
		return m, cmd
	}

	if up, ok := ui.WheelDir(msg); ok {
		// Wheel over COMMANDS moves the selection (and pages on short panes).
		if _, hit := ui.Hit(msg, ui.ZonePaneNav); hit {
			if up {
				m.list.CursorUp()
			} else {
				m.list.CursorDown()
			}
			return m, nil
		}
		if _, hit := ui.Hit(msg, ui.ZonePaneOutput); hit {
			if up {
				m.pane.Follow = false
				m.viewport.HalfPageUp()
			} else {
				m.viewport.HalfPageDown()
				if m.viewport.AtBottom() {
					m.pane.Follow = true
				}
			}
		}
		return m, nil
	}

	if m.commandRunning {
		return m, nil
	}

	maxRow := len(m.list.Items()) - 1

	// Hover: highlight the row under the cursor (needs MouseModeAllMotion).
	if _, isMotion := msg.(tea.MouseMotionMsg); isMotion {
		if maxRow >= 0 {
			if row, hit := ui.HitListRow(msg, maxRow); hit {
				m.list.Select(row)
			}
		}
		return m, nil
	}

	click, ok := ui.IsLeftClick(msg)
	if !ok {
		return m, nil
	}

	// Prompt / OUTPUT: focus the input (do not steal left-nav Back clicks).
	if _, hit := ui.Hit(click, ui.ZoneCommandLine); hit {
		m.input.Focus()
		return m, nil
	}
	if m.cmdSession {
		if _, hit := ui.Hit(click, ui.ZonePaneOutput); hit {
			m.input.Focus()
			return m, nil
		}
	}

	if maxRow < 0 {
		return m, nil
	}
	row, hit := ui.HitListRow(click, maxRow)
	if !hit {
		return m, nil
	}
	m.list.Select(row)
	return m.activateSelection()
}

func (m model) activateSelection() (tea.Model, tea.Cmd) {
	switch m.bodyMode {
	case bodyModeSetupChoice:
		return m.activateSetupChoice()
	}
	switch m.focus {
	case focusMore:
		return m.activateMore()
	case focusRestartPick:
		return m.activateRestartPick()
	case focusLogsType:
		return m.activateLogsType()
	case focusLogsSource:
		return m.activateLogsSource()
	case focusCommand:
		return m.activateCommandNav()
	default:
		return m.activateMenu()
	}
}

// activateCommandNav handles the left-pane Back row while the Command window is open.
func (m model) activateCommandNav() (tea.Model, tea.Cmd) {
	item, ok := ui.SelectedItem(m.list)
	if !ok {
		return m, nil
	}
	if item.Title() == ops.BackTitle {
		m.closeCommandSession()
		return m, nil
	}
	return m, nil
}

func (m model) activateMenu() (tea.Model, tea.Cmd) {
	entry, ok := ops.Selected(m.list)
	if !ok || !ops.Allowed(entry, m.snap.Docker, m.snap.Health) {
		return m, nil
	}
	m.fromMore = false
	switch entry.Special {
	case ops.SpecialMore:
		m.showMoreList()
		return m, nil
	case ops.SpecialRestart:
		return m.beginRestartPick()
	case ops.SpecialSetup:
		m.openSetupBuilder()
		return m, m.builder.Init()
	default:
		return m.startCLI(entry.Title, entry.Args)
	}
}

func (m model) activateMore() (tea.Model, tea.Cmd) {
	entry, ok := ops.Selected(m.list)
	if !ok || !ops.Allowed(entry, m.snap.Docker, m.snap.Health) {
		return m, nil
	}
	m.fromMore = true
	switch entry.Special {
	case ops.SpecialBack:
		m.showMainMenu()
		return m, nil
	case ops.SpecialCommand:
		return m, m.openCommandSession()
	case ops.SpecialLogs:
		return m.beginLogsPick()
	case ops.SpecialEditEnv:
		m.openSecretsBuilder()
		return m, m.builder.Init()
	case ops.SpecialEditConfig:
		m.openSettingsBuilder()
		return m, m.builder.Init()
	}
	return m, nil
}

func (m model) copyClipboard() tea.Cmd {
	if m.focus == focusCommand {
		return ui.CopyText(m.input.Value())
	}
	if m.bodyMode == bodyModeBuilder {
		return m.builder.CopyFocused()
	}
	if s := m.snap.StatusMsg; s != "" {
		return ui.CopyText(s)
	}
	return nil
}

func (m model) toggleMouseCapture() (tea.Model, tea.Cmd) {
	m.mouseCapture = !m.mouseCapture
	if m.mouseCapture {
		return m.withStatusMsg("Mouse on — clicks and wheel active")
	}
	// Sticky until F6 again — auto-clear would hide the only feedback.
	m.snap.StatusMsg = "SELECT TEXT — drag, then right-click Copy (or WT Ctrl+Shift+C) · F6 back"
	m.snap.StatusMsgTick = 0
	m.statusMsgClearGen++ // invalidate any pending clear
	return m, nil
}

func (m model) withStatusMsg(s string) (model, tea.Cmd) {
	m.snap.StatusMsg = s
	m.snap.StatusMsgTick = 0
	m.statusMsgClearGen++
	return m, statusbar.ClearStatusMsgAfter(m.statusMsgClearGen)
}
