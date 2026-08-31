package ui

import (
	"strings"

	"charm.land/lipgloss/v2"

	"eve-industry-planner/deployment-tool/tui/theme"
)

// StyleProgressOverlay applies theme colors to a live pane.progress board.
func StyleProgressOverlay(text string) string {
	if text == "" {
		return ""
	}
	fill := lipgloss.NewStyle().Foreground(theme.Primary)
	empty := lipgloss.NewStyle().Foreground(theme.Border)
	dot := lipgloss.NewStyle().Foreground(theme.Muted)
	title := lipgloss.NewStyle().Foreground(theme.Title).Bold(true)
	textStyle := lipgloss.NewStyle().Foreground(theme.Text)
	muted := lipgloss.NewStyle().Foreground(theme.Muted)
	ok := lipgloss.NewStyle().Foreground(lipgloss.Color("108"))             // status LightGreen
	err := lipgloss.NewStyle().Foreground(lipgloss.Color("167")).Bold(true) // LightRed

	var b strings.Builder
	for i, line := range strings.Split(text, "\n") {
		if i > 0 {
			b.WriteByte('\n')
		}
		if i == 0 && strings.HasPrefix(line, "Pulling ") {
			b.WriteString(title.Render(line))
			continue
		}
		b.WriteString(styleProgressLine(line, fill, empty, dot, textStyle, muted, ok, err))
	}
	return b.String()
}

func styleProgressLine(line string, fill, empty, dot, textStyle, muted, ok, err lipgloss.Style) string {
	var b strings.Builder
	var plain strings.Builder
	flushPlain := func() {
		if plain.Len() == 0 {
			return
		}
		b.WriteString(styleProgressPlain(plain.String(), textStyle, muted, ok, err))
		plain.Reset()
	}
	for _, r := range line {
		switch r {
		case '█':
			flushPlain()
			b.WriteString(fill.Render("█"))
		case '░':
			flushPlain()
			b.WriteString(empty.Render("░"))
		case '·':
			flushPlain()
			b.WriteString(dot.Render("·"))
		default:
			plain.WriteRune(r)
		}
	}
	flushPlain()
	return b.String()
}

func styleProgressPlain(s string, textStyle, muted, ok, err lipgloss.Style) string {
	if strings.Contains(s, " ERROR") {
		idx := strings.Index(s, " ERROR")
		return textStyle.Render(s[:idx]) + err.Render(s[idx:])
	}
	trim := strings.TrimRight(s, " ")
	switch {
	case strings.HasSuffix(trim, "pulled"), strings.HasSuffix(trim, "up to date"):
		return styleTrailingWord(s, ok, textStyle)
	case strings.HasSuffix(trim, "waiting"):
		return styleTrailingWord(s, muted, textStyle)
	default:
		return textStyle.Render(s)
	}
}

func styleTrailingWord(s string, wordStyle, restStyle lipgloss.Style) string {
	trim := strings.TrimRight(s, " ")
	pad := s[len(trim):]
	space := strings.LastIndex(trim, " ")
	if space < 0 {
		return wordStyle.Render(trim) + pad
	}
	return restStyle.Render(trim[:space+1]) + wordStyle.Render(trim[space+1:]) + pad
}
