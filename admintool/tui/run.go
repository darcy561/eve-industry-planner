// Package tui is the desktop terminal UI. Design: docs/admintool/TUI.md
package tui

import "eve-industry-planner/admintool/tui/screens/home"

// Run starts the interactive TUI (blocking). Closes only on explicit quit.
func Run() error {
	return home.Run()
}
