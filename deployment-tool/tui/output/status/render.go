// Package status formats eip status OUTPUT for the TUI (lipgloss).
// Layout SoT: internal/status (FormatPlain) + status.WriteReport.
package status

import (
	"strings"

	"charm.land/lipgloss/v2"

	"eve-industry-planner/deployment-tool/internal/status"
	"eve-industry-planner/deployment-tool/tui/theme"
)

// Msg delivers a structured status report for TUI formatting.
type Msg struct {
	Report status.Report
}

// Render formats a status report with TUI theme colors (OUTPUT pane).
func Render(r status.Report) string {
	var b strings.Builder
	status.WriteReport(r, &glossWriter{&b})
	return b.String()
}

type glossWriter struct {
	b *strings.Builder
}

func (w *glossWriter) Section(title string) {
	w.b.WriteString(lipgloss.NewStyle().Foreground(theme.Muted).Bold(true).
		Render(status.Section(title)))
	w.b.WriteByte('\n')
}

func (w *glossWriter) Row(label, signal, detail, ports string) {
	lab, sig, rest := status.RowParts(label, signal, detail, ports)
	sigStyled := styleSignal(signal, sig)
	switch signal {
	case string(status.Down), string(status.Problems):
		labS := lipgloss.NewStyle().Foreground(lipgloss.Color("167")).Bold(true).Render(lab)
		restS := lipgloss.NewStyle().Foreground(lipgloss.Color("167")).Bold(true).Render(rest)
		w.b.WriteString("  " + labS + " " + sigStyled + " " + restS)
	case string(status.Partial):
		labS := lipgloss.NewStyle().Foreground(lipgloss.Color("214")).Render(lab)
		restS := lipgloss.NewStyle().Foreground(lipgloss.Color("214")).Render(rest)
		w.b.WriteString("  " + labS + " " + sigStyled + " " + restS)
	default:
		w.b.WriteString("  " + lab + " " + sigStyled + " " + rest)
	}
	w.b.WriteByte('\n')
}

func (w *glossWriter) Task(text string, signal status.Signal) {
	out := status.TaskLine(text)
	switch signal {
	case status.Down, status.Problems:
		out = lipgloss.NewStyle().Foreground(lipgloss.Color("167")).Render(out)
	case status.Partial:
		out = lipgloss.NewStyle().Foreground(lipgloss.Color("214")).Render(out)
	}
	w.b.WriteString(out)
	w.b.WriteByte('\n')
}

func styleSignal(signal, padded string) string {
	switch signal {
	case string(status.Down), string(status.Problems):
		return lipgloss.NewStyle().
			Foreground(lipgloss.Color("255")).
			Background(lipgloss.Color("167")).
			Bold(true).
			Render(padded)
	case string(status.Partial):
		return lipgloss.NewStyle().
			Foreground(lipgloss.Color("0")).
			Background(lipgloss.Color("214")).
			Bold(true).
			Render(padded)
	case string(status.OKStar):
		return lipgloss.NewStyle().Foreground(lipgloss.Color("214")).Bold(true).Render(padded)
	case string(status.OK):
		return lipgloss.NewStyle().Foreground(lipgloss.Color("108")).Bold(true).Render(padded)
	default:
		return padded
	}
}
