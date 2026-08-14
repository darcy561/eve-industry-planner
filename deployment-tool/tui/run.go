// Package tui is the desktop terminal UI. Design: technical-documentation/deployment/deployment-tool/tui/tui.md
package tui

import "eve-industry-planner/deployment-tool/tui/screens/home"

// Run starts the interactive TUI (blocking). Closes only on explicit quit.
func Run() error {
	return home.Run()
}
