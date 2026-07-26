package home

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/bubbles/list"
	tea "github.com/charmbracelet/bubbletea"

	"eve-industry-planner/admintool/tui/exec"
	"eve-industry-planner/admintool/tui/ops"
	"eve-industry-planner/admintool/tui/ui"
)

func loadServiceListCmd(kind string) tea.Cmd {
	return func() tea.Msg {
		out, err := exec.CollectRawStdout([]string{"logs", "--list"})
		if err != nil {
			return serviceListMsg{err: err, kind: kind}
		}
		var names []string
		for _, line := range strings.Split(out, "\n") {
			line = strings.TrimSpace(line)
			if line == "" {
				continue
			}
			names = append(names, line)
		}
		return serviceListMsg{names: names, kind: kind}
	}
}

func (m *model) setLoadingList(desc string) {
	m.list.SetItems([]list.Item{ui.NewItem("Loading…", desc)})
	m.list.Select(0)
}

func (m *model) leaveToMenu() {
	m.focus = focusMenu
	m.serviceTargets = nil
	m.logsFollow = false
	ops.ApplyDockerGate(&m.list, m.snap.Docker)
	m.layout()
}

func (m model) onServiceList(msg serviceListMsg) (tea.Model, tea.Cmd) {
	label := msg.kind
	if msg.err != nil {
		m.leaveToMenu()
		m.pane.Append(label + ": " + msg.err.Error())
		m.syncPane()
		return m, nil
	}
	if len(msg.names) == 0 {
		m.leaveToMenu()
		m.pane.Append(label + ": nothing is running — start with eip up / eip dev")
		m.syncPane()
		return m, nil
	}
	m.serviceTargets = msg.names
	switch msg.kind {
	case "restart":
		m.focus = focusRestartPick
		m.showRestartPicker()
	case "logs":
		m.focus = focusLogsSource
		m.showLogsSourcePicker()
	default:
		m.leaveToMenu()
		return m, nil
	}
	m.layout()
	return m, nil
}

func (m *model) showRestartPicker() {
	items := make([]list.Item, 0, len(m.serviceTargets)+2)
	items = append(items, ui.NewItem(pickBack, "Return to command list"))
	items = append(items, ui.NewItem("all", "Rolling restart every Swarm service"))
	for _, short := range m.serviceTargets {
		items = append(items, ui.NewItem(short, "Rolling restart this service"))
	}
	m.list.SetItems(items)
	m.list.Select(0)
}

func (m model) updateRestartPick(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch {
		case msg.String() == "ctrl+c":
			return m, tea.Quit
		case isEsc(msg), msg.String() == "q":
			m.leaveToMenu()
			return m, nil
		case isPageUp(msg), isPageDown(msg):
			m.handleOutputScroll(msg)
			return m, nil
		case isEnter(msg):
			item, ok := ui.SelectedItem(m.list)
			if !ok || item.Title() == "Loading…" {
				return m, nil
			}
			if item.Title() == pickBack {
				m.leaveToMenu()
				return m, nil
			}
			target := item.Title()
			m.leaveToMenu()
			return m.startCLI("restart "+target, []string{"restart", target, "-y"})
		}
	}
	m.list, _ = m.list.Update(msg)
	return m, nil
}

func (m *model) showLogsTypePicker() {
	items := []list.Item{
		ui.NewItem(pickBack, "Return to command list"),
		ui.NewItem("Recent dump", "Last lines into OUTPUT pane (default tail 100)"),
		ui.NewItem("Follow", "Live stream in a new logview window"),
	}
	m.list.SetItems(items)
	m.list.Select(0)
}

func (m model) updateLogsType(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch {
		case msg.String() == "ctrl+c":
			return m, tea.Quit
		case isEsc(msg), msg.String() == "q":
			m.leaveToMenu()
			return m, nil
		case isPageUp(msg), isPageDown(msg):
			m.handleOutputScroll(msg)
			return m, nil
		case isEnter(msg):
			item, ok := ui.SelectedItem(m.list)
			if !ok {
				return m, nil
			}
			switch item.Title() {
			case pickBack:
				m.leaveToMenu()
				return m, nil
			case "Recent dump":
				m.logsFollow = false
			case "Follow":
				m.logsFollow = true
			default:
				return m, nil
			}
			m.focus = focusLogsSource
			m.serviceTargets = nil
			m.pane.AppendBlank()
			m.pane.Append("Loading services for logs…")
			m.syncPane()
			m.setLoadingList("fetching running Swarm services")
			return m, loadServiceListCmd("logs")
		}
	}
	m.list, _ = m.list.Update(msg)
	return m, nil
}

func (m *model) showLogsSourcePicker() {
	items := make([]list.Item, 0, len(m.serviceTargets)+2)
	items = append(items, ui.NewItem(pickBack, "Return to log type"))
	if !m.logsFollow {
		items = append(items, ui.NewItem("all", "Dump recent logs from every running service"))
	}
	for _, short := range m.serviceTargets {
		desc := "Dump recent logs"
		if m.logsFollow {
			desc = "Follow in a new logview window"
		}
		items = append(items, ui.NewItem(short, desc))
	}
	m.list.SetItems(items)
	m.list.Select(0)
}

func (m model) updateLogsSource(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch {
		case msg.String() == "ctrl+c":
			return m, tea.Quit
		case isEsc(msg), msg.String() == "q":
			m.focus = focusLogsType
			m.showLogsTypePicker()
			m.layout()
			return m, nil
		case isPageUp(msg), isPageDown(msg):
			m.handleOutputScroll(msg)
			return m, nil
		case isEnter(msg):
			item, ok := ui.SelectedItem(m.list)
			if !ok || item.Title() == "Loading…" {
				return m, nil
			}
			if item.Title() == pickBack {
				m.focus = focusLogsType
				m.showLogsTypePicker()
				m.layout()
				return m, nil
			}
			target := item.Title()
			follow := m.logsFollow
			m.leaveToMenu()
			if follow {
				args := []string{"logs", target, "-f", "--ui", "--tail", "100"}
				if err := exec.StartInNewConsole(args); err != nil {
					m.pane.Append(err.Error())
					m.syncPane()
					return m, nil
				}
				m.pane.Append(fmt.Sprintf("Opened follow window: eip logs %s -f --ui", target))
				m.syncPane()
				return m, nil
			}
			return m.startCLI("logs "+target, []string{"logs", target, "--tail", "100"})
		}
	}
	m.list, _ = m.list.Update(msg)
	return m, nil
}
