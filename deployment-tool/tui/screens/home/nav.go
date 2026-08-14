package home

import (
	"charm.land/bubbles/v2/list"
	"charm.land/bubbles/v2/textinput"
	tea "charm.land/bubbletea/v2"

	"eve-industry-planner/deployment-tool/internal/kit"
	"eve-industry-planner/deployment-tool/tui/ops"
	"eve-industry-planner/deployment-tool/tui/ui"
)

// showMainMenu restores the COMMANDS list (clears fromMore).
func (m *model) showMainMenu() {
	m.focus = focusMenu
	m.fromMore = false
	m.bodyMode = bodyModeOps
	ops.ApplyMenuGate(&m.list, m.snap.Docker, m.snap.Health)
	m.layout()
}

// showMoreList shows the MORE submenu.
func (m *model) showMoreList() {
	m.focus = focusMore
	m.bodyMode = bodyModeOps
	ops.ApplyMoreGate(&m.list, m.snap.Docker)
	m.layout()
}

// returnToMoreOrMenu goes back to More when fromMore, else Main.
func (m *model) returnToMoreOrMenu() {
	if m.fromMore {
		m.showMoreList()
		return
	}
	m.showMainMenu()
}

// refreshMenuGates rebuilds Main or More when Docker or Health lights change.
func (m *model) refreshMenuGates() {
	if m.bodyMode != bodyModeOps || m.cmdSession {
		// Avoid yanking the More list while the Command window is open.
		return
	}
	switch m.focus {
	case focusMore:
		ops.ApplyMoreGate(&m.list, m.snap.Docker)
	case focusMenu:
		ops.ApplyMenuGate(&m.list, m.snap.Docker, m.snap.Health)
	}
}

// openCommandSession opens the combined host/core command window (More → Command or `:`).
// Left pane becomes a Back row (same pattern as Logs/Restart pickers) — not a frozen More list.
func (m *model) openCommandSession() tea.Cmd {
	m.cmdSession = true
	m.focus = focusCommand
	m.input.SetValue("")
	m.input.Placeholder = "status | secrets | cli list | list | …"
	// Prompt caret in-band — no hardware cursor (avoids list scroll jump).
	m.input.Prompt = kit.CLIName + " ▌"
	m.input.Focus()
	m.showCommandNav()
	return textinput.Blink
}

func (m *model) refocusCommandSession() tea.Cmd {
	m.cmdSession = true
	m.focus = focusCommand
	m.input.SetValue("")
	m.input.Placeholder = "status | secrets | cli list | list | …"
	m.input.Prompt = kit.CLIName + " ▌"
	m.input.Focus()
	m.showCommandNav()
	return textinput.Blink
}

// showCommandNav replaces the left list with ← Back (click / enter leaves, like other More tools).
func (m *model) showCommandNav() {
	m.list.SetItems([]list.Item{ui.NewItem(ops.BackTitle, "Leave command window")})
	m.list.Select(0)
	m.layout()
}

func (m *model) closeCommandSession() {
	m.input.Blur()
	m.cmdSession = false
	m.input.Placeholder = "up | status | logs api | ..."
	m.input.Prompt = kit.CLIName + " "
	m.returnToMoreOrMenu()
}

// appendOut appends a line to OUTPUT and syncs the viewport.
func (m *model) appendOut(line string) {
	m.pane.Append(line)
	m.syncPane()
}

// appendOutBlank appends a blank line then text.
func (m *model) appendOutBlank(line string) {
	m.pane.AppendBlank()
	m.pane.Append(line)
	m.syncPane()
}

// waitStream continues demuxing the active child CLI stream.
func (m model) waitStream() (tea.Model, tea.Cmd) {
	if m.stream != nil {
		return m, m.stream.WaitCmd()
	}
	return m, nil
}
