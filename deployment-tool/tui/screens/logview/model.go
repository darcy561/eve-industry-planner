// Package logview is a thin follow-logs window (title bar + scrolling log body).
package logview

import (
	"bytes"
	"context"
	"fmt"
	"strings"

	"charm.land/bubbles/v2/viewport"
	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"

	"eve-industry-planner/deployment-tool/internal/kit"
	"eve-industry-planner/deployment-tool/internal/ops"
	"eve-industry-planner/deployment-tool/tui/brand"
	"eve-industry-planner/deployment-tool/tui/theme"
	"eve-industry-planner/deployment-tool/tui/ui"
)

type lineMsg string
type doneMsg struct{ err error }

type model struct {
	service string
	tail    string
	vp      viewport.Model
	text    string
	follow  bool
	width   int
	height  int
	ready   bool
	status  string // muted status in title (live / ended / error)
	cancel  context.CancelFunc
	lines   <-chan string
	errs    <-chan error
}

// Run opens the follow logview (blocking) until esc/q/ctrl+c.
func Run(service, tail string) error {
	service = strings.TrimSpace(service)
	if service == "" {
		return fmt.Errorf("logview: service required")
	}
	if tail == "" {
		tail = "100"
	}
	ctx, cancel := context.WithCancel(context.Background())
	ch := make(chan string, 256)
	errCh := make(chan error, 1)

	go func() {
		w := &lineWriter{ch: ch, ctx: ctx}
		err := ops.StreamLogs(ctx, ops.LogsOpts{
			Target: service,
			Tail:   tail,
			Follow: true,
		}, w)
		_ = w.Flush()
		errCh <- err
		close(ch)
	}()

	vp := ui.NewOutputViewport("")
	vp.MouseWheelEnabled = true
	m := model{
		service: service,
		tail:    tail,
		vp:      vp,
		follow:  true,
		status:  "live",
		cancel:  cancel,
		lines:   ch,
		errs:    errCh,
	}
	p := tea.NewProgram(m)
	_, err := p.Run()
	cancel()
	return err
}

func (m model) Init() tea.Cmd {
	return waitLine(m.lines, m.errs)
}

func waitLine(lines <-chan string, errs <-chan error) tea.Cmd {
	return func() tea.Msg {
		line, ok := <-lines
		if ok {
			return lineMsg(line)
		}
		var err error
		select {
		case err = <-errs:
		default:
		}
		return doneMsg{err: err}
	}
}

func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		m.ready = true
		m.layout()
		return m, nil

	case lineMsg:
		if m.text != "" {
			m.text += "\n"
		}
		m.text += string(msg)
		m.syncVP()
		return m, waitLine(m.lines, m.errs)

	case doneMsg:
		if msg.err != nil && msg.err != context.Canceled {
			m.status = "error"
			if m.text != "" {
				m.text += "\n"
			}
			m.text += msg.err.Error()
			m.syncVP()
		} else {
			m.status = "ended"
		}
		return m, nil

	case tea.KeyPressMsg:
		switch msg.String() {
		case "ctrl+c", "q", "esc":
			if m.cancel != nil {
				m.cancel()
			}
			return m, tea.Quit
		case "end":
			m.follow = true
			m.vp.GotoBottom()
			return m, nil
		case "home":
			m.follow = false
			m.vp.GotoTop()
			return m, nil
		}
		var cmd tea.Cmd
		m.vp, cmd = m.vp.Update(msg)
		if !m.vp.AtBottom() {
			m.follow = false
		} else {
			m.follow = true
		}
		return m, cmd
	case tea.MouseMsg:
		var cmd tea.Cmd
		m.vp, cmd = m.vp.Update(msg)
		if !m.vp.AtBottom() {
			m.follow = false
		} else {
			m.follow = true
		}
		return m, cmd
	}
	return m, nil
}

func (m *model) layout() {
	chrome := brand.MiniHeight() + 1 /*rule*/ + 1 /*footer*/
	bodyH := max(m.height-chrome, 3)
	ui.SizeViewport(&m.vp, max(12, m.width-2*theme.HMargin), bodyH)
	m.syncVP()
}

func (m *model) syncVP() {
	ui.SetViewportText(&m.vp, m.text, m.follow)
}

func (m model) View() tea.View {
	if !m.ready {
		return ui.NewProgramView("Loading logs…", ui.ProgramViewOpts{Title: kit.CLIName + " logs"})
	}
	header := m.renderHeader()
	body := lipgloss.NewStyle().
		Width(m.width).
		Padding(0, theme.HMargin).
		Render(m.vp.View())
	footer := ui.HelpLine(m.width, "wheel/pgup/pgdn scroll   end follow   esc/q close")
	title := kit.CLIName + " · logs " + m.service
	return ui.NewProgramView(
		lipgloss.JoinVertical(lipgloss.Left, header, body, footer),
		ui.ProgramViewOpts{Title: title},
	)
}

func (m model) renderHeader() string {
	logo := brand.MiniLogo(theme.Primary)
	title := lipgloss.NewStyle().Bold(true).Foreground(theme.Title).Render(kit.CLIName + " logs")
	svc := lipgloss.NewStyle().Foreground(theme.Primary).Bold(true).Render(m.service)
	st := lipgloss.NewStyle().Foreground(theme.Muted).Render(m.status)
	textCol := lipgloss.JoinVertical(lipgloss.Left,
		title,
		lipgloss.JoinHorizontal(lipgloss.Top, svc, "  ", st),
	)
	textCol = lipgloss.NewStyle().PaddingLeft(2).Render(textCol)
	row := lipgloss.JoinHorizontal(lipgloss.Top, logo, textCol)
	rule := lipgloss.NewStyle().
		Foreground(theme.Border).
		Render(strings.Repeat("─", max(8, m.width-2*theme.HMargin)))
	return lipgloss.NewStyle().
		Width(m.width).
		Padding(0, theme.HMargin).
		Render(lipgloss.JoinVertical(lipgloss.Left, row, rule))
}

// lineWriter splits Write() into newline-delimited channel sends.
type lineWriter struct {
	ch  chan<- string
	buf bytes.Buffer
	ctx context.Context
}

func (w *lineWriter) Write(p []byte) (int, error) {
	n, _ := w.buf.Write(p)
	for {
		data := w.buf.Bytes()
		i := bytes.IndexByte(data, '\n')
		if i < 0 {
			break
		}
		line := strings.TrimRight(string(data[:i]), "\r")
		w.buf.Next(i + 1)
		select {
		case w.ch <- line:
		case <-w.ctx.Done():
			return n, w.ctx.Err()
		}
	}
	return n, nil
}

func (w *lineWriter) Flush() error {
	if w.buf.Len() == 0 {
		return nil
	}
	line := strings.TrimRight(w.buf.String(), "\r\n")
	w.buf.Reset()
	if line == "" {
		return nil
	}
	select {
	case w.ch <- line:
	case <-w.ctx.Done():
		return w.ctx.Err()
	}
	return nil
}
