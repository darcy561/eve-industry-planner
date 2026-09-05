// Package home is the main ops dashboard (commands | output).
package home

import (
	"fmt"
	"strings"

	"charm.land/bubbles/v2/list"
	"charm.land/bubbles/v2/textinput"
	"charm.land/bubbles/v2/viewport"
	tea "charm.land/bubbletea/v2"

	"eve-industry-planner/deployment-tool/internal/kit"
	eipmsg "eve-industry-planner/deployment-tool/internal/msg"
	"eve-industry-planner/deployment-tool/tui/brand"
	"eve-industry-planner/deployment-tool/tui/builder"
	"eve-industry-planner/deployment-tool/tui/exec"
	"eve-industry-planner/deployment-tool/tui/ops"
	outstatus "eve-industry-planner/deployment-tool/tui/output/status"
	"eve-industry-planner/deployment-tool/tui/pane"
	"eve-industry-planner/deployment-tool/tui/theme"
	"eve-industry-planner/deployment-tool/tui/ui"

	statusbar "eve-industry-planner/deployment-tool/tui/status"
)

type focusPane int

const (
	focusMenu focusPane = iota
	focusMore
	focusCommand // combined host eip + core tasks command window
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
	pickBack             = ops.BackTitle
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
	// Forced skips the menu gate: a planned follow-up runs on the state the plan
	// was made for, not the one the gate expects an operator to pick it from.
	Forced bool
}

type model struct {
	focus               focusPane
	bodyMode            bodyMode
	docKind             docKind
	builder             builder.Session
	list                list.Model
	delegate            *ui.MarqueeDelegate
	input               textinput.Model
	viewport            viewport.Model
	snap                statusbar.Snapshot
	pane                pane.Buffer
	progressText        string
	progressFrac        *float64 // optional [0,1] for terminal ProgressBar; nil = indeterminate while live
	commandRunning      bool
	cancelling          bool
	stream              *exec.Stream
	pendingCLI          []cliJob
	refreshing          bool
	probeStaleTicks     int
	statusMsgClearGen   int
	width               int
	height              int
	ready               bool
	leftW               int
	rightW              int
	bodyH               int
	serviceTargets      []string
	logsFollow          bool
	opsListBackup       []list.Item
	fromMore            bool // child opened from More → close returns to More
	cmdSession          bool // Command window open (host + core); freezes More marquee
	pendingRelaunch     bool // set when update asks the TUI to restart
	pendingResumeUpdate bool // relaunch with EIP_UPDATE_RESUME (continue stacks/images)
	relaunchOnExit      bool // after tea.Quit, Run() starts a new eip process
	relaunchResume      bool // pass EIP_UPDATE_RESUME to the new process
	mouseCapture        bool // true: clicks/wheel; false: terminal drag-select / native copy
}

const probeStaleLimit = 4 // ~12s at 3s poll

func newModel() model {
	ti := textinput.New()
	ti.Placeholder = "up | status | logs api | ..."
	ti.CharLimit = 256
	ti.Prompt = kit.CLIName + " "
	ui.ApplyTextInputDark(&ti)

	menu, delegate := ops.NewMenuList()
	return model{
		focus:        focusMenu,
		list:         menu,
		delegate:     delegate,
		input:        ti,
		viewport:     ui.NewOutputViewport(""),
		snap:         statusbar.Default(),
		pane:         pane.Buffer{Follow: true},
		refreshing:   true,
		mouseCapture: true,
	}
}

func (m model) Init() tea.Cmd {
	cmds := []tea.Cmd{statusbar.ProbeCmd(m.snap), ui.MarqueeTick(), statusbar.PollTick()}
	if c := resumeAfterBinaryCmd(); c != nil {
		cmds = append(cmds, c)
	}
	return tea.Batch(cmds...)
}

type resumeUpdateMsg struct{}

func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		if m.ready && msg.Width == m.width && msg.Height == m.height {
			return m, nil
		}
		m.width, m.height = msg.Width, msg.Height
		m.ready = true
		return m, m.layout()

	case builder.CancelMsg:
		return m.closeBuilder()

	case builder.DoneMsg:
		return m.onBuilderDone()

	case ui.MarqueeTickMsg:
		var cmd tea.Cmd
		if m.bodyMode == bodyModeBuilder {
			m.builder, cmd = m.builder.Update(msg)
		} else if !m.cmdSession {
			// Freeze More list marquee while Command is open — avoids left-pane churn.
			m.list, cmd = m.list.Update(msg)
		}
		if m.snap.StatusMsg != "" {
			m.snap.StatusMsgTick++
		}
		if cmd == nil {
			cmd = ui.MarqueeTick()
		}
		return m, cmd

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
		if !m.mouseCapture {
			return m, nil
		}
		return m.handleMouse(msg)

	case ui.ClipboardCopiedMsg:
		return m.withStatusMsg("Copied to clipboard")

	case ui.ClipboardCopyFailedMsg:
		return m.withStatusMsg("Copy failed — try F6 select text, then right-click Copy")

	case tea.ClipboardMsg:
		if m.bodyMode == bodyModeBuilder {
			var cmd tea.Cmd
			m.builder, cmd = m.builder.Update(msg)
			return m, cmd
		}
		if m.focus == focusCommand {
			return m, ui.InsertClipboard(&m.input, msg.String())
		}
		return m, nil

	case statusbar.Msg:
		m.refreshing = false
		m.probeStaleTicks = 0
		prevDocker, prevHealth := m.snap.Docker, m.snap.Health
		statusMsg, statusTick := m.snap.StatusMsg, m.snap.StatusMsgTick
		m.snap = msg.Snap
		m.snap.ToolVersion = kit.Version
		m.snap.StatusMsg = statusMsg
		m.snap.StatusMsgTick = statusTick
		if m.snap.Docker != prevDocker || m.snap.Health != prevHealth {
			m.refreshMenuGates()
		}
		return m, nil

	case resumeUpdateMsg:
		// Fresh pane — do not leave a sticky "Resuming…" line after the child ends.
		m.pane.Clear()
		m.syncPane()
		// Bypass menu gates: Init races Probe, and Docker may still be LightOff.
		return m.startCLIForced("update", []string{"update"})

	case exec.EventMsg:
		if msg.Event.Kind == eipmsg.KindStack && msg.Event.State == "update" {
			m.applyUpdateRestartMessage(msg.Event.Message)
			// restart / restart-resume are TUI control chips, not status-bar copy.
			if isUpdateControlMessage(msg.Event.Message) {
				return m.waitStream()
			}
		}
		if statusbar.ApplyEvent(&m.snap, msg.Event) {
			m.refreshMenuGates()
		}
		return m.waitStream()

	case pane.AppendMsg:
		m.appendOut(msg.Text)
		return m.waitStream()

	case pane.ProgressMsg:
		if msg.Done {
			if strings.TrimSpace(msg.Text) != "" {
				m.pane.Append(msg.Text)
			}
			m.clearProgress()
		} else {
			m.progressText = msg.Text
			m.progressFrac = msg.Fraction
		}
		m.syncPane()
		return m.waitStream()

	case outstatus.Msg:
		m.appendOut(outstatus.Render(msg.Report))
		return m.waitStream()

	case pane.ClearMsg:
		m.pane.Clear()
		m.clearProgress()
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

	case serviceListMsg:
		return m.onServiceList(msg)
	}

	// Global clipboard / select-mode keys (before builder / menus steal them).
	// F6 — not ctrl+shift+m: Windows Terminal steals that for its own Mark Mode.
	if key, ok := msg.(tea.KeyPressMsg); ok {
		switch {
		case key.String() == "f6", key.Code == tea.KeyF6:
			return m.toggleMouseCapture()
		case key.String() == "ctrl+shift+c", key.String() == "ctrl+shift+C":
			// Select mode: never write the clipboard — that chord is Terminal's
			// "copy selection", and our write was racing/overwriting it.
			if !m.mouseCapture {
				return m.withStatusMsg("Highlighted text: use right-click → Copy (eip does not bind this key here)")
			}
			if cmd := m.copyClipboard(); cmd != nil {
				return m, cmd
			}
			return m.withStatusMsg("Nothing to copy — click a field first (or F6 + right-click for screen text)")
		case key.String() == "ctrl+v":
			if m.bodyMode == bodyModeBuilder || m.focus == focusCommand {
				return m, ui.PasteText()
			}
		}
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
		if key, ok := msg.(tea.KeyPressMsg); ok {
			if m.handleOutputScroll(key) {
				return m, nil
			}
			switch key.String() {
			case "ctrl+c", "esc":
				if !m.cancelling {
					m.cancelling = true
					m.pendingCLI = nil
					m.pendingRelaunch = false
					m.pendingResumeUpdate = false
					m.appendOut("Cancelling…")
					if m.stream != nil {
						m.stream.Cancel()
					}
				}
				return m.waitStream()
			}
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
	wasCancel := m.cancelling
	m.cancelling = false
	m.commandRunning = false
	m.stream = nil
	if m.progressText != "" {
		m.pane.Append(m.progressText)
	}
	m.clearProgress()
	m.syncPane()
	if wasCancel {
		m.pendingCLI = nil
		m.pendingRelaunch = false
		m.pendingResumeUpdate = false
		m.appendOut("Cancelled.")
	} else if strings.TrimSpace(msg.Text) == "" && msg.Err != nil {
		m.appendOut(msg.Err.Error())
	} else if strings.TrimSpace(msg.Text) == "" && m.pane.Text == "" {
		m.appendOut("(no output)")
	}
	if wasCancel {
		// skip error/pending/relaunch paths
	} else if msg.Err != nil {
		m.pendingRelaunch = false
		m.pendingResumeUpdate = false
		if len(m.pendingCLI) > 0 {
			m.pendingCLI = nil
			m.appendOut("Apply stopped — fix the error, then retry from : (secrets / sync).")
		}
	} else if len(m.pendingCLI) > 0 {
		return m.startNextPendingCLI()
	}
	if m.pendingRelaunch {
		// Quit tea first so the terminal leaves alt-screen/raw mode; Run() then
		// starts the new binary (RelaunchSelfOpts must not run inside a tea.Cmd).
		m.relaunchOnExit = true
		m.relaunchResume = m.pendingResumeUpdate
		m.pendingRelaunch = false
		m.pendingResumeUpdate = false
		m.snap.StatusMsg = ""
		m.snap.StatusMsgTick = 0
		m.appendOut("Restarting with new binary…")
		return m, tea.Quit
	}
	m.refreshing = true
	m.statusMsgClearGen++
	if m.cmdSession {
		cmd := m.refocusCommandSession()
		return m, tea.Batch(
			cmd,
			statusbar.ProbeCmd(m.snap),
			statusbar.ClearStatusMsgAfter(m.statusMsgClearGen),
		)
	}
	m.returnToMoreOrMenu()
	return m, tea.Batch(
		statusbar.ProbeCmd(m.snap),
		statusbar.ClearStatusMsgAfter(m.statusMsgClearGen),
	)
}

func (m *model) clearProgress() {
	m.progressText = ""
	m.progressFrac = nil
}

func (m *model) syncPane() {
	text := m.pane.Text
	if m.progressText != "" {
		if text != "" {
			text += "\n"
		}
		// Theme the live board; committed history stays plain text.
		text += ui.StyleProgressOverlay(m.progressText)
	}
	ui.SetViewportText(&m.viewport, text, m.pane.Follow)
}

func (m model) progressBar() *tea.ProgressBar {
	if m.progressText == "" && m.progressFrac == nil {
		return nil
	}
	return ui.ProgressBarFromFraction(m.progressFrac)
}

func (m *model) layout() tea.Cmd {
	// Match view chrome: pad + logo + border + status (2) + footer help (1).
	headerH := 1 + brand.Height() + 1
	statusH := 2
	footerH := 1
	bannerH := 0
	if !m.mouseCapture {
		bannerH = 1 // renderSelectBanner between status and body
	}
	chromeH := headerH + statusH + bannerH + footerH
	split := ui.CalcSplit(m.width, m.height, chromeH)
	m.leftW, m.rightW, m.bodyH = split.LeftW, split.RightW, split.BodyH

	if m.bodyMode == bodyModeBuilder {
		return m.builder.SetSize(m.leftW, m.rightW, m.bodyH)
	}
	listW, listH := ui.ListSizeInPanel(m.leftW, m.bodyH)
	ui.SizeList(&m.list, m.delegate, listW, listH)
	vpW, vpH := ui.ViewportSizeInPanel(m.rightW, m.bodyH)
	if m.cmdSession {
		// Reserve one row inside the OUTPUT panel for the command prompt.
		vpH = max(3, vpH-1)
		m.input.SetWidth(max(12, vpW-2))
	} else {
		m.input.SetWidth(max(12, m.width-2*theme.HMargin-8))
	}
	ui.SizeViewport(&m.viewport, vpW, vpH)
	m.syncPane()
	return nil
}

func (m model) startCLI(label string, args []string) (tea.Model, tea.Cmd) {
	if !ops.Allowed(ops.Entry{Title: label, Args: args}, m.snap.Docker, m.snap.Health) {
		return m, nil
	}
	return m.startCLIForced(label, args)
}

// startCLIForced runs a child CLI without Docker/Health menu gates (resume-after-update).
func (m model) startCLIForced(label string, args []string) (tea.Model, tea.Cmd) {
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
		if m.cmdSession {
			cmd := m.refocusCommandSession()
			return m, cmd
		}
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
	if job.Forced {
		return m.startCLIForced(job.Label, job.Args)
	}
	return m.startCLI(job.Label, job.Args)
}

func (m *model) handleOutputScroll(msg tea.KeyPressMsg) bool {
	switch {
	case isPageUp(msg):
		m.pane.Follow = false
		m.viewport.HalfPageUp()
		return true
	case isPageDown(msg):
		m.viewport.HalfPageDown()
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
	case tea.KeyPressMsg:
		switch {
		case msg.String() == "ctrl+c", msg.String() == "esc":
			return m, tea.Quit
		case msg.String() == ":":
			m.fromMore = false
			cmd := m.openCommandSession()
			return m, cmd
		case isPageUp(msg), isPageDown(msg):
			m.handleOutputScroll(msg)
			return m, nil
		case isEnter(msg):
			return m.activateMenu()
		}
	}
	m.list, _ = m.list.Update(msg)
	return m, nil
}

func (m model) updateMore(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyPressMsg:
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
			return m.activateMore()
		}
	}
	m.list, _ = m.list.Update(msg)
	return m, nil
}

func (m model) updateCommand(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyPressMsg:
		switch {
		case msg.String() == "ctrl+c":
			return m, tea.Quit
		case isPageUp(msg), isPageDown(msg):
			m.handleOutputScroll(msg)
			return m, nil
		case msg.String() == "esc":
			m.closeCommandSession()
			return m, nil
		case isEnter(msg):
			line := strings.TrimSpace(m.input.Value())
			if line == "" {
				// Stay open — empty Enter must not leave (click can synthesize Enter).
				m.input.Focus()
				return m, textinput.Blink
			}
			act := parseCommandLine(line)
			if act.Err != "" {
				m.appendOut(act.Err)
				cmd := m.refocusCommandSession()
				return m, cmd
			}
			switch act.Builder {
			case "setup":
				// Keep fromMore (More → Command → setup should return to More).
				m.cmdSession = false
				m.input.Blur()
				m.openSetupBuilder()
				if m.bodyMode != bodyModeBuilder {
					// Stack fetch failed — restore Command prompt (do not leave stuck Back-only).
					return m, m.refocusCommandSession()
				}
				return m, m.builder.Init()
			case "secrets":
				m.cmdSession = false
				m.input.Blur()
				m.openSecretsBuilder()
				return m, m.builder.Init()
			case "settings":
				m.cmdSession = false
				m.input.Blur()
				m.openSettingsBuilder()
				return m, m.builder.Init()
			}
			if len(act.RunArgs) == 0 {
				cmd := m.refocusCommandSession()
				return m, cmd
			}
			return m.startCLI(act.Label, act.RunArgs)
		}
	case tea.PasteMsg:
		var cmd tea.Cmd
		m.input, cmd = m.input.Update(msg)
		return m, cmd
	}
	var cmd tea.Cmd
	m.input, cmd = m.input.Update(msg)
	return m, cmd
}
