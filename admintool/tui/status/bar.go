package status

import (
	"fmt"
	"image/color"

	"charm.land/lipgloss/v2"

	"eve-industry-planner/admintool/tui/theme"
	"eve-industry-planner/admintool/tui/ui"
)

// RenderBar draws Docker · Health lights and unlabeled StatusMsg (marquee).
func RenderBar(width int, snap Snapshot) string {
	parts := []string{
		indicator("Docker", snap.Docker, ""),
		indicator("Health", snap.Health, ""),
	}
	chips := lipgloss.JoinHorizontal(lipgloss.Center, parts...)

	inner := theme.Max(0, width-2*theme.HMargin)
	chipW := lipgloss.Width(chips)
	msgW := theme.Max(0, inner-chipW-1)
	msg := ""
	if snap.StatusMsg != "" && msgW > 0 {
		text := ui.MarqueeWindow(snap.StatusMsg, msgW, snap.StatusMsgTick)
		msg = lipgloss.NewStyle().
			Foreground(theme.Muted).
			Width(msgW).
			Render(text)
	}

	var row string
	if msg != "" {
		row = lipgloss.JoinHorizontal(lipgloss.Center, chips, msg)
	} else {
		row = chips
	}

	return lipgloss.NewStyle().
		Width(width).
		Padding(0, theme.HMargin).
		Border(lipgloss.NormalBorder(), false, false, true, false).
		BorderForeground(theme.Border).
		Render(row)
}

func indicator(label string, light Light, word string) string {
	glyph, color := lightGlyph(light)
	dot := lipgloss.NewStyle().Foreground(color).Bold(true).Render(glyph)
	name := lipgloss.NewStyle().Foreground(theme.Muted).Render(label)
	out := fmt.Sprintf("%s %s", name, dot)
	if word != "" {
		out += " " + lipgloss.NewStyle().Foreground(theme.Text).Render(word)
	}
	return lipgloss.NewStyle().MarginRight(2).Render(out)
}

func lightGlyph(light Light) (glyph string, c color.Color) {
	switch light {
	case LightGreen:
		return "●", lipgloss.Color("108")
	case LightAmber:
		return "●", lipgloss.Color("214")
	case LightRed:
		return "●", lipgloss.Color("167")
	default:
		return "○", lipgloss.Color("240")
	}
}
