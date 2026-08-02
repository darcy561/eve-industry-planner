package ui

import tea "charm.land/bubbletea/v2"

// ProgramViewOpts configures declarative tea.View shell fields.
type ProgramViewOpts struct {
	Title       string
	Cursor      *tea.Cursor
	ProgressBar *tea.ProgressBar
	// MouseNone releases terminal mouse capture so drag-select / native copy work.
	// When false (default), AllMotion enables clicks, wheel, and hover highlight.
	MouseNone bool
}

// NewProgramView builds a fullscreen View (alt-screen, zone Scan).
// Mouse defaults to AllMotion (clicks / wheel / hover); set MouseNone for select mode.
func NewProgramView(content string, opts ProgramViewOpts) tea.View {
	v := tea.NewView(Scan(content))
	v.AltScreen = true
	if opts.MouseNone {
		v.MouseMode = tea.MouseModeNone
	} else {
		v.MouseMode = tea.MouseModeAllMotion
	}
	if opts.Title != "" {
		v.WindowTitle = opts.Title
	}
	v.Cursor = opts.Cursor
	v.ProgressBar = opts.ProgressBar
	return v
}

// ProgressBarFromFraction builds the host OSC progress strip (nil → indeterminate).
func ProgressBarFromFraction(fraction *float64) *tea.ProgressBar {
	if fraction == nil {
		return tea.NewProgressBar(tea.ProgressBarIndeterminate, 0)
	}
	pct := int(*fraction * 100)
	if pct < 0 {
		pct = 0
	}
	if pct > 100 {
		pct = 100
	}
	return tea.NewProgressBar(tea.ProgressBarDefault, pct)
}
