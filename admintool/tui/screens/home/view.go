package home

import (
	"fmt"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	"eve-industry-planner/admintool/internal/kit"
	"eve-industry-planner/admintool/tui/brand"
	"eve-industry-planner/admintool/tui/theme"
	"eve-industry-planner/admintool/tui/ui"

	statusbar "eve-industry-planner/admintool/tui/status"
)

func (m model) View() string {
	if !m.ready {
		return "Loading…"
	}

	header := m.renderHeader()
	bar := statusbar.RenderBar(m.width, m.snap)
	body := ui.JoinPanes(m.renderLeft(), m.renderRight())
	footer := ui.HelpLine(m.width, m.footerHelp())

	parts := []string{header, bar, body}
	if m.focus == focusCommand {
		cmdLine := lipgloss.NewStyle().
			Width(m.width).
			Padding(0, theme.HMargin).
			Foreground(theme.Text).
			Render(m.input.View())
		parts = append(parts, cmdLine)
	}
	parts = append(parts, footer)
	return lipgloss.JoinVertical(lipgloss.Left, parts...)
}

func (m model) renderHeader() string {
	logo := brand.Logo(theme.Primary)

	name := lipgloss.NewStyle().
		Bold(true).
		Foreground(theme.Title).
		Render(kit.Name)
	tag := lipgloss.NewStyle().
		Foreground(theme.Primary).
		Bold(true).
		Render(kit.Tagline)
	appVer := strings.TrimSpace(m.snap.AppVersion)
	if appVer == "" {
		appVer = "—"
	}
	ver := theme.MutedText(fmt.Sprintf("app  %s", appVer))
	rule := lipgloss.NewStyle().
		Foreground(theme.Border).
		Render(strings.Repeat("─", 28))

	textCol := lipgloss.JoinVertical(lipgloss.Left,
		name,
		tag,
		"",
		ver,
		rule,
	)

	padTop := (brand.Height() - 5) / 2
	if padTop < 0 {
		padTop = 0
	}
	textCol = lipgloss.NewStyle().PaddingTop(padTop).PaddingLeft(3).Render(textCol)
	row := lipgloss.JoinHorizontal(lipgloss.Top, logo, textCol)

	return lipgloss.NewStyle().
		Width(m.width).
		Padding(1, theme.HMargin, 0, theme.HMargin).
		Border(lipgloss.NormalBorder(), false, false, true, false).
		BorderForeground(theme.Border).
		Render(row)
}

func (m model) renderLeft() string {
	title := "COMMANDS"
	switch m.focus {
	case focusRestartPick:
		title = "RESTART"
	case focusLogsType:
		title = "LOG TYPE"
	case focusLogsSource:
		title = "LOG SOURCE"
	}
	return ui.RenderPanel(title, m.list.View(), m.leftW, m.bodyH)
}

func (m model) renderRight() string {
	return ui.RenderPanel("OUTPUT", m.viewport.View(), m.rightW, m.bodyH)
}

func (m model) footerHelp() string {
	switch m.focus {
	case focusRestartPick, focusLogsType, focusLogsSource:
		return "↑↓ select   enter confirm   esc/q back   pgup/pgdn scroll output"
	default:
		return "↑↓ select   enter run   : command   pgup/pgdn scroll output pane esc quit"
	}
}

// Run starts the home ops TUI (blocking).
func Run() error {
	p := tea.NewProgram(newModel(), tea.WithAltScreen(), tea.WithMouseCellMotion())
	_, err := p.Run()
	return err
}
