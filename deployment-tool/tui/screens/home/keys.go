package home

import tea "charm.land/bubbletea/v2"

func isEnter(msg tea.KeyPressMsg) bool {
	switch msg.String() {
	case "enter", "\r":
		return true
	default:
		return msg.Code == tea.KeyEnter
	}
}

func isEsc(msg tea.KeyPressMsg) bool {
	switch msg.String() {
	case "esc", "escape":
		return true
	default:
		return msg.Code == tea.KeyEsc
	}
}

func isPageUp(msg tea.KeyPressMsg) bool {
	switch msg.String() {
	case "pgup", "pageup", "page up", "ctrl+u":
		return true
	default:
		return msg.Code == tea.KeyPgUp
	}
}

func isPageDown(msg tea.KeyPressMsg) bool {
	switch msg.String() {
	case "pgdown", "pgdn", "pagedown", "page down", "ctrl+d":
		return true
	default:
		return msg.Code == tea.KeyPgDown
	}
}
