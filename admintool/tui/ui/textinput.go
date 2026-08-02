package ui

import (
	"charm.land/bubbles/v2/textinput"
	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"

	"eve-industry-planner/admintool/tui/theme"
)

// ApplyTextInputDark applies force-dark bubbles styles with EIP primary prompt.
// Virtual cursor is off so the widget draws an in-band caret (home Command prompt).
func ApplyTextInputDark(ti *textinput.Model) {
	if ti == nil {
		return
	}
	s := textinput.DefaultStyles(true)
	s.Focused.Prompt = lipgloss.NewStyle().Foreground(theme.Primary).Bold(true)
	s.Blurred.Prompt = lipgloss.NewStyle().Foreground(theme.Muted)
	ti.SetStyles(s)
	ti.SetVirtualCursor(false)
}

// InsertClipboard pastes text at the textinput cursor (same path as bracketed paste).
func InsertClipboard(ti *textinput.Model, text string) tea.Cmd {
	if ti == nil || text == "" {
		return nil
	}
	var cmd tea.Cmd
	*ti, cmd = ti.Update(tea.PasteMsg{Content: text})
	return cmd
}
