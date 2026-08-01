package home

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/bubbles/list"
	tea "github.com/charmbracelet/bubbletea"

	"eve-industry-planner/admintool/tui/exec"
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

func (m *model) leavePicker() {
	m.serviceTargets = nil
	m.logsFollow = false
	m.returnToMoreOrMenu()
}

// pickerChrome handles ctrl+c / esc|q / page scroll shared by pickers.
// ok=false means the key was not handled.
func (m *model) pickerChrome(msg tea.KeyMsg, onBack func()) (handled bool, quit bool) {
	switch {
	case msg.String() == "ctrl+c":
		return true, true
	case isEsc(msg), msg.String() == "q":
		onBack()
		return true, false
	case isPageUp(msg), isPageDown(msg):
		m.handleOutputScroll(msg)
		return true, false
	default:
		return false, false
	}
}

func (m model) beginRestartPick() (tea.Model, tea.Cmd) {
	m.focus = focusRestartPick
	m.serviceTargets = nil
	m.appendOutBlank("Loading services for restart…")
	m.setLoadingList("fetching running services")
	return m, loadServiceListCmd("restart")
}

func (m model) beginLogsPick() (tea.Model, tea.Cmd) {
	m.focus = focusLogsType
	m.logsFollow = false
	m.serviceTargets = nil
	m.showLogsTypePicker()
	m.layout()
	return m, nil
}

func (m model) onServiceList(msg serviceListMsg) (tea.Model, tea.Cmd) {
	if msg.err != nil {
		m.leavePicker()
		m.appendOut(msg.kind + ": " + msg.err.Error())
		return m, nil
	}
	if len(msg.names) == 0 {
		m.leavePicker()
		m.appendOut(msg.kind + ": nothing is running — use Start or Dev")
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
		m.leavePicker()
		return m, nil
	}
	m.layout()
	return m, nil
}

func (m *model) showRestartPicker() {
	items := make([]list.Item, 0, len(m.serviceTargets)+2)
	items = append(items, ui.NewItem(pickBack, "Back"))
	items = append(items, ui.NewItem("all", "Reload every service"))
	for _, short := range m.serviceTargets {
		items = append(items, ui.NewItem(short, "Reload this service"))
	}
	m.list.SetItems(items)
	m.list.Select(0)
}

func (m model) updateRestartPick(msg tea.Msg) (tea.Model, tea.Cmd) {
	if key, ok := msg.(tea.KeyMsg); ok {
		if handled, quit := m.pickerChrome(key, func() {
			m.fromMore = false
			m.leavePicker()
		}); handled {
			if quit {
				return m, tea.Quit
			}
			return m, nil
		}
		if isEnter(key) {
			item, ok := ui.SelectedItem(m.list)
			if !ok || item.Title() == "Loading…" {
				return m, nil
			}
			if item.Title() == pickBack {
				m.fromMore = false
				m.leavePicker()
				return m, nil
			}
			target := item.Title()
			m.fromMore = false
			m.leavePicker()
			return m.startCLI("restart "+target, []string{"restart", target, "-y"})
		}
	}
	m.list, _ = m.list.Update(msg)
	return m, nil
}

func (m *model) showLogsTypePicker() {
	back := "Back"
	if m.fromMore {
		back = "Back to More"
	}
	m.list.SetItems([]list.Item{
		ui.NewItem(pickBack, back),
		ui.NewItem("Recent dump", "Last lines in OUTPUT"),
		ui.NewItem("Follow", "Live stream in a new window"),
	})
	m.list.Select(0)
}

func (m model) updateLogsType(msg tea.Msg) (tea.Model, tea.Cmd) {
	if key, ok := msg.(tea.KeyMsg); ok {
		if handled, quit := m.pickerChrome(key, m.leavePicker); handled {
			if quit {
				return m, tea.Quit
			}
			return m, nil
		}
		if isEnter(key) {
			item, ok := ui.SelectedItem(m.list)
			if !ok {
				return m, nil
			}
			switch item.Title() {
			case pickBack:
				m.leavePicker()
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
			m.appendOutBlank("Loading services for logs…")
			m.setLoadingList("fetching running services")
			return m, loadServiceListCmd("logs")
		}
	}
	m.list, _ = m.list.Update(msg)
	return m, nil
}

func (m *model) showLogsSourcePicker() {
	items := make([]list.Item, 0, len(m.serviceTargets)+2)
	items = append(items, ui.NewItem(pickBack, "Back to log type"))
	if !m.logsFollow {
		items = append(items, ui.NewItem("all", "Recent logs from every service"))
	}
	for _, short := range m.serviceTargets {
		desc := "Recent logs"
		if m.logsFollow {
			desc = "Follow in a new window"
		}
		items = append(items, ui.NewItem(short, desc))
	}
	m.list.SetItems(items)
	m.list.Select(0)
}

func (m model) updateLogsSource(msg tea.Msg) (tea.Model, tea.Cmd) {
	if key, ok := msg.(tea.KeyMsg); ok {
		backToType := func() {
			m.focus = focusLogsType
			m.showLogsTypePicker()
			m.layout()
		}
		if handled, quit := m.pickerChrome(key, backToType); handled {
			if quit {
				return m, tea.Quit
			}
			return m, nil
		}
		if isEnter(key) {
			item, ok := ui.SelectedItem(m.list)
			if !ok || item.Title() == "Loading…" {
				return m, nil
			}
			if item.Title() == pickBack {
				backToType()
				return m, nil
			}
			target := item.Title()
			follow := m.logsFollow
			m.leavePicker()
			if follow {
				if err := exec.StartInNewConsole([]string{"logs", target, "-f", "--ui", "--tail", "100"}); err != nil {
					m.appendOut(err.Error())
					return m, nil
				}
				m.appendOut(fmt.Sprintf("Opened follow window: eip logs %s -f --ui", target))
				return m, nil
			}
			return m.startCLI("logs "+target, []string{"logs", target, "--tail", "100"})
		}
	}
	m.list, _ = m.list.Update(msg)
	return m, nil
}
