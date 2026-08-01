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
	eipmsg "eve-industry-planner/admintool/internal/msg"
	"eve-industry-planner/admintool/tui/brand"
	"eve-industry-planner/admintool/tui/builder"
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
	focusMore
	focusCommand
	focusRestartPick
	focusLogsType
	focusLogsSource
)

type bodyMode int

const (
	bodyModeOps bodyMode = iota
	bodyModeBuilder
	bodyModeSetupChoice // after Setup env Persist: defaults vs advanced config
)

// docKind tracks which document builder is open (Persist routing + post-apply).
type docKind int

const (
	docNone docKind = iota
	docEnvSetup
	docEnvEdit
	docConfigSetup
	docConfigEdit
)

const (
	pickBack             = "← Back"
	choiceConfigDefaults = "Use defaults"
	choiceConfigAdvanced = "Advanced"
)

type serviceListMsg struct {
	names []string
	err   error
	kind  string // "restart" | "logs"
}

// cliJob is one queued child eip invocation after Persist.
type cliJob struct {
	Label string
	Args  []string
}

type model struct {
	focus             focusPane
	bodyMode          bodyMode
	docKind           docKind
	builder           builder.Session
	list              list.Model
	delegate          *ui.MarqueeDelegate
	input             textinput.Model
	viewport          viewport.Model
	snap              statusbar.Snapshot
	pane              pane.Buffer
	commandRunning    bool
	stream            *exec.Stream
	pendingCLI        []cliJob
	refreshing        bool
	probeStaleTicks   int
	statusMsgClearGen int
	width             int
	height            int
	ready             bool
	leftW             int
	rightW            int
	bodyH             int
	serviceTargets    []string
	logsFollow        bool
	opsListBackup     []list.Item
	fromMore          bool // child opened from More → close returns to More
	pendingRelaunch   bool // set when update-binary asks the TUI to restart
}

const probeStaleLimit = 4 // ~12s at 3s poll

func newModel() model {
	ti := textinput.New()
	ti.Placeholder = "up | status | logs api | ..."
	ti.CharLimit = 256
	ti.Prompt = kit.CLIName + " "
	ti.PromptStyle = lipgloss.NewStyle().Foreground(theme.Primary).Bold(true)

	menu, delegate := ops.NewMenuList()
	return model{
		focus:      focusMenu,
		list:       menu,
		delegate:   delegate,
		input:      ti,
		viewport:   ui.NewOutputViewport(""),
		snap:       statusbar.Default(),
		pane:       pane.Buffer{Follow: true},
		refreshing: true,
	}
}

func (m model) Init() tea.Cmd {
	return tea.Batch(statusbar.ProbeCmd(m.snap), ui.MarqueeTick(), statusbar.PollTick())
}

func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width, m.height = msg.Width, msg.Height
		m.ready = true
		m.layout()
		return m, nil

	case builder.CancelMsg:
		return m.closeBuilder()

	case builder.DoneMsg:
		return m.onBuilderDone()

	case ui.MarqueeTickMsg:
		if m.bodyMode == bodyModeBuilder {
			m.builder.AdvanceMarquee()
		} else if m.delegate != nil {
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
		}
		m.refreshing = true
		m.probeStaleTicks = 0
		return m, tea.Batch(append(cmds, statusbar.ProbeCmd(m.snap))...)

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
		if m.snap.Docker != prevDocker {
			m.refreshMenuForDocker()
		}
		return m, nil

	case exec.EventMsg:
		if msg.Event.Kind == eipmsg.KindStack && msg.Event.State == "update-binary" &&
			strings.EqualFold(strings.TrimSpace(msg.Event.Message), "restart") {
			m.pendingRelaunch = true
		}
		if statusbar.ApplyEvent(&m.snap, msg.Event) {
			m.refreshMenuForDocker()
		}
		return m.waitStream()

	case pane.AppendMsg:
		m.appendOut(msg.Text)
		return m.waitStream()

	case outstatus.Msg:
		m.appendOut(outstatus.Render(msg.Report))
		return m.waitStream()

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
		return m.onCLIDone(msg)

	case relaunchFailedMsg:
		m.appendOut("Could not restart automatically: " + msg.err.Error())
		m.appendOut("Quit and run eip again to use the new binary.")
		m.refreshing = true
		m.statusMsgClearGen++
		m.returnToMoreOrMenu()
		return m, tea.Batch(
			statusbar.ProbeCmd(m.snap),
			statusbar.ClearStatusMsgAfter(m.statusMsgClearGen),
		)

	case serviceListMsg:
		return m.onServiceList(msg)
	}

	if m.bodyMode == bodyModeBuilder {
		var cmd tea.Cmd
		m.builder, cmd = m.builder.Update(msg)
		return m, cmd
	}
	if m.bodyMode == bodyModeSetupChoice {
		return m.updateSetupChoice(msg)
	}
	if m.commandRunning {
		if key, ok := msg.(tea.KeyMsg); ok && m.handleOutputScroll(key) {
			return m, nil
		}
		return m, nil
	}

	switch m.focus {
	case focusMore:
		return m.updateMore(msg)
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

func (m model) onCLIDone(msg exec.DoneMsg) (tea.Model, tea.Cmd) {
	m.commandRunning = false
	m.stream = nil
	if strings.TrimSpace(msg.Text) == "" && msg.Err != nil {
		m.appendOut(msg.Err.Error())
	} else if strings.TrimSpace(msg.Text) == "" && m.pane.Text == "" {
		m.appendOut("(no output)")
	}
	if msg.Err != nil {
		m.pendingRelaunch = false
		if len(m.pendingCLI) > 0 {
			m.pendingCLI = nil
			m.appendOut("Apply stopped — fix the error, then retry from Command (secrets / sync).")
		}
	} else if len(m.pendingCLI) > 0 {
		return m.startNextPendingCLI()
	}
	if m.pendingRelaunch {
		m.pendingRelaunch = false
		m.appendOut("Restarting with new binary…")
		return m, relaunchSelfCmd()
	}
	m.refreshing = true
	m.statusMsgClearGen++
	m.returnToMoreOrMenu()
	return m, tea.Batch(
		statusbar.ProbeCmd(m.snap),
		statusbar.ClearStatusMsgAfter(m.statusMsgClearGen),
	)
}

func relaunchSelfCmd() tea.Cmd {
	return func() tea.Msg {
		if err := kit.RelaunchSelf(nil); err != nil {
			return relaunchFailedMsg{err: err}
		}
		return tea.Quit()
	}
}

type relaunchFailedMsg struct{ err error }

func (m *model) syncPane() {
	ui.SetViewportText(&m.viewport, m.pane.Text, m.pane.Follow)
}

func (m *model) layout() {
	chromeH := 1 + brand.Height() + 1 + 2 + 1
	if m.focus == focusCommand && m.bodyMode == bodyModeOps {
		chromeH++
	}
	split := ui.CalcSplit(m.width, m.height, chromeH)
	m.leftW, m.rightW, m.bodyH = split.LeftW, split.RightW, split.BodyH

	if m.bodyMode == bodyModeBuilder {
		m.builder.SetSize(m.leftW, m.rightW, m.bodyH)
		return
	}
	listW, listH := ui.ListSizeInPanel(m.leftW, m.bodyH)
	ui.SizeList(&m.list, m.delegate, listW, listH)
	vpW, vpH := ui.ViewportSizeInPanel(m.rightW, m.bodyH)
	ui.SizeViewport(&m.viewport, vpW, vpH)
	m.syncPane()
	m.input.Width = theme.Max(12, m.width-2*theme.HMargin-8)
}

func (m model) startCLI(label string, args []string) (tea.Model, tea.Cmd) {
	if !ops.Allowed(ops.Entry{Title: label, Args: args}, m.snap.Docker) {
		return m, nil
	}
	m.commandRunning = true
	m.pane.Follow = true
	m.statusMsgClearGen++
	m.snap.StatusMsg = ""
	m.snap.StatusMsgTick = 0
	m.appendOutBlank(fmt.Sprintf("Running %s…", label))

	stream, err := exec.Start(append([]string(nil), args...), label)
	if err != nil {
		m.commandRunning = false
		m.pendingCLI = nil
		m.appendOut(err.Error())
		m.returnToMoreOrMenu()
		return m, nil
	}
	m.stream = stream
	return m, stream.WaitCmd()
}

func (m model) startNextPendingCLI() (tea.Model, tea.Cmd) {
	if len(m.pendingCLI) == 0 {
		return m, nil
	}
	job := m.pendingCLI[0]
	m.pendingCLI = m.pendingCLI[1:]
	return m.startCLI(job.Label, job.Args)
}

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
			m.fromMore = false
			return m, m.openCommandLine()
		case isPageUp(msg), isPageDown(msg):
			m.handleOutputScroll(msg)
			return m, nil
		case isEnter(msg):
			entry, ok := ops.Selected(m.list)
			if !ok || !ops.Allowed(entry, m.snap.Docker) {
				return m, nil
			}
			m.fromMore = false
			switch entry.Special {
			case ops.SpecialMore:
				m.showMoreList()
				return m, nil
			case ops.SpecialRestart:
				return m.beginRestartPick()
			case ops.SpecialSetup:
				m.openSetupBuilder()
				return m, m.builder.Init()
			default:
				return m.startCLI(entry.Title, entry.Args)
			}
		}
	}
	m.list, _ = m.list.Update(msg)
	return m, nil
}

func (m model) updateMore(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch {
		case msg.String() == "ctrl+c":
			return m, tea.Quit
		case isEsc(msg), msg.String() == "q":
			m.showMainMenu()
			return m, nil
		case isPageUp(msg), isPageDown(msg):
			m.handleOutputScroll(msg)
			return m, nil
		case isEnter(msg):
			entry, ok := ops.Selected(m.list)
			if !ok || !ops.Allowed(entry, m.snap.Docker) {
				return m, nil
			}
			m.fromMore = true
			switch entry.Special {
			case ops.SpecialCommand:
				return m, m.openCommandLine()
			case ops.SpecialLogs:
				return m.beginLogsPick()
			case ops.SpecialEditEnv:
				m.openSecretsBuilder()
				return m, m.builder.Init()
			case ops.SpecialEditConfig:
				m.openSettingsBuilder()
				return m, m.builder.Init()
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
			m.returnToMoreOrMenu()
			return m, nil
		case isEnter(msg):
			line := strings.TrimSpace(m.input.Value())
			m.input.Blur()
			if line == "" {
				m.returnToMoreOrMenu()
				return m, nil
			}
			args := strings.Fields(line)
			if len(args) == 1 {
				switch args[0] {
				case "init", "setup":
					m.fromMore = false
					m.openSetupBuilder()
					return m, m.builder.Init()
				case "edit", "edit-env", "env":
					m.fromMore = false
					m.openSecretsBuilder()
					return m, m.builder.Init()
				case "edit-config", "config", "settings":
					m.fromMore = false
					m.openSettingsBuilder()
					return m, m.builder.Init()
				}
			}
			return m.startCLI(line, args)
		}
	}
	var cmd tea.Cmd
	m.input, cmd = m.input.Update(msg)
	return m, cmd
}
