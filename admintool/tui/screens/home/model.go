// Package home is the main ops dashboard (commands | output).
package home

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/bubbles/list"
	"github.com/charmbracelet/bubbles/textinput"
	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	"eve-industry-planner/admintool/cmd/commands"
	"eve-industry-planner/admintool/internal/kit"
	"eve-industry-planner/admintool/tui/brand"
	"eve-industry-planner/admintool/tui/exec"
	"eve-industry-planner/admintool/tui/ops"
	outstatus "eve-industry-planner/admintool/tui/output/status"
	"eve-industry-planner/admintool/tui/pane"
	"eve-industry-planner/admintool/tui/theme"
	"eve-industry-planner/admintool/tui/ui"

	statusbar "eve-industry-planner/admintool/tui/status"
)

type focusPane int

const (
	focusMenu focusPane = iota
	focusCommand
	focusRestartPick
	focusLogsType
	focusLogsSource
)

const pickBack = "← Back"

type serviceListMsg struct {
	names []string
	err   error
	kind  string // "restart" | "logs"
}

type model struct {
	focus             focusPane
	list              list.Model
	delegate          *ui.MarqueeDelegate
	input             textinput.Model
	viewport          viewport.Model
	snap              statusbar.Snapshot
	pane              pane.Buffer
	commandRunning    bool // user CLI child in flight (TUI-local; not a chip)
	stream            *exec.Stream
	refreshing        bool // background ProbeCmd in flight
	probeStaleTicks   int  // PollTicks while refreshing; force-restart if stuck
	statusMsgClearGen int  // invalidates pending StatusMsg hold timers
	width             int
	height            int
	ready             bool
	leftW             int
	rightW            int
	bodyH             int
	serviceTargets    []string // running short names for pickers
	logsFollow        bool     // true = follow in new window; false = dump to OUTPUT
}

// probeStaleLimit: ~12s at 3s poll — then assume a hung probe and start another.
const probeStaleLimit = 4

func newModel() model {
	ti := textinput.New()
	ti.Placeholder = "up | status | logs api | ..."
	ti.CharLimit = 256
	ti.Prompt = kit.CLIName + " "
	ti.PromptStyle = lipgloss.NewStyle().Foreground(theme.Primary).Bold(true)

	menu, delegate := ops.NewMenuList()
	probe := statusbar.Default()
	return model{
		focus:      focusMenu,
		list:       menu,
		delegate:   delegate,
		input:      ti,
		viewport:   ui.NewOutputViewport(""),
		snap:       probe,
		pane:       pane.Buffer{Follow: true},
		refreshing: true, // cleared when first ProbeCmd Msg arrives
	}
}

func (m model) Init() tea.Cmd {
	return tea.Batch(statusbar.ProbeCmd(m.snap), ui.MarqueeTick(), statusbar.PollTick())
}

func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		m.ready = true
		m.layout()
		return m, nil

	case ui.MarqueeTickMsg:
		if m.delegate != nil {
			m.delegate.Advance(m.list.Index())
		}
		if m.snap.StatusMsg != "" {
			m.snap.StatusMsgTick++
		}
		return m, ui.MarqueeTick()

	case statusbar.PollTickMsg:
		cmds := []tea.Cmd{statusbar.PollTick()}
		if m.refreshing {
			m.probeStaleTicks++
			if m.probeStaleTicks < probeStaleLimit {
				return m, tea.Batch(cmds...)
			}
			// Hung probe (e.g. Docker Desktop mid-restart) — allow a new one.
		}
		m.refreshing = true
		m.probeStaleTicks = 0
		cmds = append(cmds, statusbar.ProbeCmd(m.snap))
		return m, tea.Batch(cmds...)

	case tea.MouseMsg:
		return m, nil

	case statusbar.Msg:
		m.refreshing = false
		m.probeStaleTicks = 0
		prevDocker := m.snap.Docker
		statusMsg, statusTick := m.snap.StatusMsg, m.snap.StatusMsgTick
		m.snap = msg.Snap
		m.snap.ToolVersion = commands.Version
		m.snap.StatusMsg = statusMsg
		m.snap.StatusMsgTick = statusTick
		// Menu follows snap.Docker (not EIPMSG directly).
		if m.snap.Docker != prevDocker {
			ops.ApplyDockerGate(&m.list, m.snap.Docker)
		}
		return m, nil

	case exec.EventMsg:
		// Live chip.* → snap; rebuild menu only if Docker light changed.
		if statusbar.ApplyEvent(&m.snap, msg.Event) {
			ops.ApplyDockerGate(&m.list, m.snap.Docker)
		}
		if m.stream != nil {
			return m, m.stream.WaitCmd()
		}
		return m, nil

	case pane.AppendMsg:
		m.pane.Append(msg.Text)
		m.syncPane()
		if m.stream != nil {
			return m, m.stream.WaitCmd()
		}
		return m, nil

	case outstatus.Msg:
		m.pane.Append(outstatus.Render(msg.Report))
		m.syncPane()
		if m.stream != nil {
			return m, m.stream.WaitCmd()
		}
		return m, nil

	case pane.ClearMsg:
		m.pane.Clear()
		m.syncPane()
		return m, nil

	case statusbar.ClearStatusMsgMsg:
		if msg.Gen == m.statusMsgClearGen && !m.commandRunning {
			m.snap.StatusMsg = ""
			m.snap.StatusMsgTick = 0
		}
		return m, nil

	case exec.DoneMsg:
		m.commandRunning = false
		m.stream = nil
		// Do not replace pane history — chunks already appended. Only note empty/error.
		if strings.TrimSpace(msg.Text) == "" && msg.Err != nil {
			m.pane.Append(msg.Err.Error())
			m.syncPane()
		} else if strings.TrimSpace(msg.Text) == "" && m.pane.Text == "" {
			m.pane.Append("(no output)")
			m.syncPane()
		}
		m.focus = focusMenu
		m.refreshing = true
		m.statusMsgClearGen++
		return m, tea.Batch(
			statusbar.ProbeCmd(m.snap),
			statusbar.ClearStatusMsgAfter(m.statusMsgClearGen),
		)

	case serviceListMsg:
		return m.onServiceList(msg)
	}

	if m.commandRunning {
		// Allow output scroll-back while a child is streaming.
		if key, ok := msg.(tea.KeyMsg); ok {
			if m.handleOutputScroll(key) {
				return m, nil
			}
		}
		return m, nil
	}

	switch m.focus {
	case focusCommand:
		return m.updateCommand(msg)
	case focusRestartPick:
		return m.updateRestartPick(msg)
	case focusLogsType:
		return m.updateLogsType(msg)
	case focusLogsSource:
		return m.updateLogsSource(msg)
	default:
		return m.updateMenu(msg)
	}
}

func (m *model) syncPane() {
	ui.SetViewportText(&m.viewport, m.pane.Text, m.pane.Follow)
}

func (m *model) layout() {
	chromeH := 1 /*top pad*/ + brand.Height() + 1 /*bottom rule*/ +
		2 /*status*/ + 1 /*footer*/
	if m.focus == focusCommand {
		chromeH++
	}

	split := ui.CalcSplit(m.width, m.height, chromeH)
	m.leftW, m.rightW, m.bodyH = split.LeftW, split.RightW, split.BodyH

	listW, listH := ui.ListSizeInPanel(m.leftW, m.bodyH)
	ui.SizeList(&m.list, m.delegate, listW, listH)

	vpW, vpH := ui.ViewportSizeInPanel(m.rightW, m.bodyH)
	ui.SizeViewport(&m.viewport, vpW, vpH)
	// Re-wrap OUTPUT from pane.Text at the new width (SoftWrap is not sticky).
	m.syncPane()
	m.input.Width = theme.Max(12, m.width-2*theme.HMargin-8)
}

func (m model) startCLI(label string, args []string) (tea.Model, tea.Cmd) {
	entry := ops.Entry{Title: label, Args: args}
	if !ops.Allowed(entry, m.snap.Docker) {
		return m, nil
	}
	m.commandRunning = true
	m.pane.Follow = true
	m.statusMsgClearGen++ // cancel any pending post-command StatusMsg clear
	m.snap.StatusMsg = ""
	m.snap.StatusMsgTick = 0
	m.pane.AppendBlank()
	m.pane.Append(fmt.Sprintf("Running %s…", label))
	m.syncPane()
	m.focus = focusMenu
	argsCopy := append([]string(nil), args...)

	stream, err := exec.Start(argsCopy, label)
	if err != nil {
		m.commandRunning = false
		m.pane.Append(err.Error())
		m.syncPane()
		return m, nil
	}
	m.stream = stream
	return m, stream.WaitCmd()
}

// handleOutputScroll scrolls the OUTPUT pane. PgUp leaves follow mode so history
// stays put while chunks still append; PgDn to the bottom resumes follow.
func (m *model) handleOutputScroll(msg tea.KeyMsg) bool {
	switch {
	case isPageUp(msg):
		m.pane.Follow = false
		m.viewport.HalfViewUp()
		return true
	case isPageDown(msg):
		m.viewport.HalfViewDown()
		if m.viewport.AtBottom() {
			m.pane.Follow = true
		}
		return true
	default:
		return false
	}
}

func (m model) updateMenu(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch {
		case msg.String() == "ctrl+c", msg.String() == "esc":
			return m, tea.Quit
		case msg.String() == ":":
			if !ops.Allowed(ops.Entry{Special: ops.SpecialCommand}, m.snap.Docker) {
				return m, nil
			}
			m.focus = focusCommand
			m.input.SetValue("")
			m.input.Focus()
			m.layout()
			return m, textinput.Blink
		case isPageUp(msg), isPageDown(msg):
			m.handleOutputScroll(msg)
			return m, nil
		case isEnter(msg):
			entry, ok := ops.Selected(m.list)
			if !ok {
				return m, nil
			}
			switch entry.Special {
			case ops.SpecialCommand:
				m.focus = focusCommand
				m.input.SetValue("")
				m.input.Focus()
				m.layout()
				return m, textinput.Blink
			case ops.SpecialRestart:
				m.focus = focusRestartPick
				m.serviceTargets = nil
				m.pane.AppendBlank()
				m.pane.Append("Loading services for restart…")
				m.syncPane()
				m.setLoadingList("fetching running Swarm services")
				return m, loadServiceListCmd("restart")
			case ops.SpecialLogs:
				m.focus = focusLogsType
				m.logsFollow = false
				m.serviceTargets = nil
				m.showLogsTypePicker()
				m.layout()
				return m, nil
			default:
				return m.startCLI(entry.Title, entry.Args)
			}
		}
	}
	m.list, _ = m.list.Update(msg)
	return m, nil
}

func (m model) updateCommand(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch {
		case msg.String() == "ctrl+c":
			return m, tea.Quit
		case msg.String() == "esc":
			m.input.Blur()
			m.focus = focusMenu
			m.layout()
			return m, nil
		case isEnter(msg):
			line := strings.TrimSpace(m.input.Value())
			m.input.Blur()
			m.focus = focusMenu
			m.layout()
			if line == "" {
				return m, nil
			}
			return m.startCLI(line, strings.Fields(line))
		}
	}
	var cmd tea.Cmd
	m.input, cmd = m.input.Update(msg)
	return m, cmd
}
