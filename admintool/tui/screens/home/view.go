package home

import (
	"fmt"
	"strings"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"

	"eve-industry-planner/admintool/internal/kit"
	"eve-industry-planner/admintool/internal/process"
	"eve-industry-planner/admintool/tui/brand"
	"eve-industry-planner/admintool/tui/theme"
	"eve-industry-planner/admintool/tui/ui"

	statusbar "eve-industry-planner/admintool/tui/status"
)

func (m model) View() tea.View {
	if !m.ready {
		return ui.NewProgramView("Loading…", ui.ProgramViewOpts{Title: kit.CLIName})
	}

	header := m.renderHeader()
	bar := statusbar.RenderBar(m.width, m.snap)
	var body string
	switch m.bodyMode {
	case bodyModeBuilder:
		body = m.builder.View()
	default:
		body = ui.JoinPanes(m.renderLeft(), m.renderRight())
	}
	footer := ui.HelpLine(m.width, m.footerHelp())

	parts := []string{header, bar}
	if !m.mouseCapture {
		parts = append(parts, m.renderSelectBanner())
	}
	parts = append(parts, body, footer)
	title := kit.CLIName
	switch {
	case m.commandRunning:
		title = kit.CLIName + " · running…"
	case m.bodyMode == bodyModeBuilder:
		title = kit.CLIName + " · " + m.builder.Title
	}
	return ui.NewProgramView(
		lipgloss.JoinVertical(lipgloss.Left, parts...),
		ui.ProgramViewOpts{
			Title:       title,
			Cursor:      m.focusCursor(),
			ProgressBar: m.progressBar(),
			MouseNone:   !m.mouseCapture,
		},
	)
}

func (m model) focusCursor() *tea.Cursor {
	// Builder uses huh's virtual cursor. Command window uses an in-prompt caret
	// (no hardware cursor — wrong Y scrolls the alt-screen / jumps More).
	return nil
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

	padTop := max((brand.Height()-5)/2, 0)
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
	if m.bodyMode == bodyModeSetupChoice {
		title = "CONFIG"
	} else {
		switch m.focus {
		case focusMore:
			title = "MORE"
		case focusCommand:
			title = "COMMAND"
		case focusRestartPick:
			title = "RESTART"
		case focusLogsType:
			title = "LOG TYPE"
		case focusLogsSource:
			title = "LOG SOURCE"
		}
	}
	return ui.Mark(ui.ZonePaneNav, ui.RenderPanel(title, m.list.View(), m.leftW, m.bodyH))
}

func (m model) renderRight() string {
	title := "OUTPUT"
	if m.cmdSession {
		title = "COMMAND"
	}
	inner := m.viewport.View()
	if m.cmdSession {
		// Prompt lives inside the panel under the scroll region so wheel/PgUp
		// never push it over the footer (footer stays the help line).
		prompt := lipgloss.NewStyle().Foreground(theme.Text).Render(m.input.View())
		inner = lipgloss.JoinVertical(lipgloss.Left, inner, ui.Mark(ui.ZoneCommandLine, prompt))
	}
	return ui.Mark(ui.ZonePaneOutput, ui.RenderPanel(title, inner, m.rightW, m.bodyH))
}

func (m model) renderSelectBanner() string {
	label := " SELECT TEXT — drag to highlight, then right-click Copy · F6 restores clicks "
	return lipgloss.NewStyle().
		Width(m.width).
		Align(lipgloss.Center).
		Bold(true).
		Foreground(theme.OnPrimary).
		Background(theme.Primary).
		Render(label)
}

func (m model) footerHelp() string {
	if !m.mouseCapture {
		return "SELECT TEXT — drag · right-click Copy · F6 back to clicks"
	}
	if m.commandRunning {
		if m.cancelling {
			return "cancelling…   wheel/pgup/pgdn scroll output"
		}
		return "esc/ctrl+c cancel   wheel/pgup/pgdn scroll output"
	}
	switch m.bodyMode {
	case bodyModeBuilder:
		return m.builder.Help()
	case bodyModeSetupChoice:
		return "↑↓/click confirm   ← Back skip   esc skip   ctrl+c quit"
	}
	switch m.focus {
	case focusCommand:
		return "enter run   host: status secrets…   core: cli list   esc leave"
	case focusMore:
		return "↑↓/click open   ← Back   esc/q back   wheel nav/output"
	case focusRestartPick, focusLogsType, focusLogsSource:
		return "↑↓/click confirm   ← Back   esc/q back   wheel nav/output"
	default:
		return "↑↓/click run   : command   F6 select text   ctrl+shift+c copy   esc quit"
	}
}

// Run starts the home ops TUI (blocking).
func Run() error {
	process.EnsureTUIConsoleSize()
	p := tea.NewProgram(newModel())
	final, err := p.Run()
	if m, ok := final.(model); ok && m.stream != nil {
		m.stream.Cancel()
	}
	return err
}
