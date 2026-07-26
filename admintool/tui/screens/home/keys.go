package home

import tea "github.com/charmbracelet/bubbletea"

func isEnter(msg tea.KeyMsg) bool {
	return msg.Type == tea.KeyEnter || msg.String() == "enter" || msg.String() == "\r"
}

func isEsc(msg tea.KeyMsg) bool {
	if msg.Type == tea.KeyEsc {
		return true
	}
	switch msg.String() {
	case "esc", "escape":
		return true
	default:
		return false
	}
}

func isPageUp(msg tea.KeyMsg) bool {
	if msg.Type == tea.KeyPgUp {
		return true
	}
	switch msg.String() {
	case "pgup", "pageup", "page up", "ctrl+u":
		return true
	default:
		return false
	}
}

func isPageDown(msg tea.KeyMsg) bool {
	if msg.Type == tea.KeyPgDown {
		return true
	}
	switch msg.String() {
	case "pgdown", "pgdn", "pagedown", "page down", "ctrl+d":
		return true
	default:
		return false
	}
}
