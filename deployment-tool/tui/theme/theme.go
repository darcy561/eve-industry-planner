// Package theme is the shared TUI palette and layout gutters.
package theme

import "charm.land/lipgloss/v2"

// Layout gutters (columns).
const (
	HMargin = 1
	ColGap  = 1
)

// MUI-dark inspired palette; terminal default background (no grey header band).
var (
	Primary        = lipgloss.Color("33")
	OnPrimary      = lipgloss.Color("255")
	OnPrimaryMuted = lipgloss.Color("195")
	Muted          = lipgloss.Color("246")
	Border         = lipgloss.Color("239")
	Title          = lipgloss.Color("255")
	Text           = lipgloss.Color("252")
)

func Max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
