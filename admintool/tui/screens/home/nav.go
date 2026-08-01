package home

import (
	"github.com/charmbracelet/bubbles/textinput"
	tea "github.com/charmbracelet/bubbletea"

	"eve-industry-planner/admintool/tui/ops"
)

// showMainMenu restores the COMMANDS list (clears fromMore).
func (m *model) showMainMenu() {
	m.focus = focusMenu
	m.fromMore = false
	m.bodyMode = bodyModeOps
	ops.ApplyDockerGate(&m.list, m.snap.Docker)
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

// refreshMenuForDocker rebuilds Main or More when the Docker light changes.
func (m *model) refreshMenuForDocker() {
	if m.bodyMode != bodyModeOps {
		return
	}
	switch m.focus {
	case focusMore:
		ops.ApplyMoreGate(&m.list, m.snap.Docker)
	case focusMenu:
		ops.ApplyDockerGate(&m.list, m.snap.Docker)
	}
}

// openCommandLine focuses the typed-command input.
func (m *model) openCommandLine() tea.Cmd {
	m.focus = focusCommand
	m.input.SetValue("")
	m.input.Focus()
	m.layout()
	return textinput.Blink
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
