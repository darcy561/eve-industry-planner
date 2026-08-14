package ui

import (
	"time"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/ansi"
)

const marqueeGap = "   "
const marqueeInterval = 200 * time.Millisecond

// MarqueeTickMsg advances in-place scrolling for the selected list row.
type MarqueeTickMsg struct{}

// MarqueeTick schedules the next marquee frame.
func MarqueeTick() tea.Cmd {
	return tea.Tick(marqueeInterval, func(time.Time) tea.Msg {
		return MarqueeTickMsg{}
	})
}

// FitEllipsis truncates to width cells with a trailing ellipsis when needed.
func FitEllipsis(s string, width int) string {
	if width <= 0 {
		return ""
	}
	return ansi.Truncate(s, width, "…")
}

// MarqueeWindow returns a fixed-width window into s, scrolling when s is longer.
func MarqueeWindow(s string, width, offset int) string {
	if width <= 0 {
		return ""
	}
	if ansi.StringWidth(s) <= width {
		return s
	}
	loop := s + marqueeGap
	loopW := ansi.StringWidth(loop)
	if loopW <= 0 {
		return FitEllipsis(s, width)
	}
	start := max(offset%loopW, 0)
	return ansi.Cut(loop+loop, start, start+width)
}
