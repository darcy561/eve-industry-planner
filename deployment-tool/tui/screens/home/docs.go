package home

import (
	"context"
	"strings"

	"charm.land/bubbles/v2/list"
	tea "charm.land/bubbletea/v2"

	"eve-industry-planner/deployment-tool/internal/kit"
	"eve-industry-planner/deployment-tool/tui/ops"
	initui "eve-industry-planner/deployment-tool/tui/screens/init"
	"eve-industry-planner/deployment-tool/tui/ui"

	statusbar "eve-industry-planner/deployment-tool/tui/status"
)

func (m *model) openSetupBuilder() {
	// Callers set fromMore (Main/menu clears it; Command preserves More → Command).
	if kit.StacksMissing("") {
		res, err := kit.UpdateStacks(context.Background(), kit.StackUpdateOptions{MissingOnly: true})
		if err != nil {
			m.appendOutBlank("stack fetch failed: " + err.Error())
			m.appendOutBlank("run eip init, then retry Setup")
			return
		}
		for _, name := range res.Updated {
			m.appendOutBlank("wrote " + name + " (from " + res.Branch + ")")
		}
	}
	m.openEnvBuilder("SETUP", docEnvSetup)
}

func (m *model) openSecretsBuilder() {
	m.openEnvBuilder("SECRETS", docEnvEdit)
}

func (m *model) openSettingsBuilder() {
	m.openConfigBuilder("SETTINGS", docConfigEdit)
}

func (m *model) openEnvBuilder(title string, kind docKind) {
	m.docKind = kind
	m.bodyMode = bodyModeBuilder
	m.builder = initui.NewEnvSession(title)
	m.builder.SetSize(m.leftW, m.rightW, m.bodyH)
	m.focus = focusMenu
}

func (m *model) openConfigBuilder(title string, kind docKind) {
	m.docKind = kind
	m.bodyMode = bodyModeBuilder
	m.builder = initui.NewConfigSession(title)
	m.builder.SetSize(m.leftW, m.rightW, m.bodyH)
	m.focus = focusMenu
}

// exitBuilder clears builder state and restores the ops list buffer (not navigation).
func (m *model) exitBuilder() {
	m.bodyMode = bodyModeOps
	m.docKind = docNone
	m.restoreOpsList()
}

func (m model) closeBuilder() (tea.Model, tea.Cmd) {
	m.exitBuilder()
	m.returnToMoreOrMenu()
	return m, nil
}

func (m *model) restoreOpsList() {
	if m.opsListBackup == nil {
		return
	}
	m.list.SetItems(m.opsListBackup)
	m.opsListBackup = nil
	ops.ApplyMenuGate(&m.list, m.snap.Docker, m.snap.Health)
}

func (m model) onBuilderDone() (tea.Model, tea.Cmd) {
	switch m.docKind {
	case docEnvSetup, docEnvEdit:
		if err := initui.PersistEnv(&m.builder); err != nil {
			return m, m.builder.SetFinishError(err.Error())
		}
		m.appendOutBlank("Wrote .env (and cli.env_backup_path on eip.config.yaml).")
		if m.docKind == docEnvSetup {
			return m.openSetupConfigChoice()
		}
		m.exitBuilder()
		return m.afterDocApply(true, false)
	case docConfigSetup, docConfigEdit:
		obsBefore := initui.ObservabilityEnabled()
		if err := initui.PersistConfig(&m.builder); err != nil {
			return m, m.builder.SetFinishError(err.Error())
		}
		m.appendOutBlank("Wrote eip.config.yaml.")
		withSecrets := m.docKind == docConfigSetup
		m.exitBuilder()
		return m.afterDocApply(withSecrets, initui.ObservabilityEnabled() != obsBefore)
	default:
		return m.closeBuilder()
	}
}

func (m model) openSetupConfigChoice() (tea.Model, tea.Cmd) {
	m.opsListBackup = append([]list.Item(nil), m.list.Items()...)
	m.bodyMode = bodyModeSetupChoice
	m.docKind = docNone
	m.focus = focusMenu
	m.list.SetItems([]list.Item{
		ui.NewItem(pickBack, "Skip config for now (Settings later)"),
		ui.NewItem(choiceConfigDefaults, "Write starter settings (keeps backup path)"),
		ui.NewItem(choiceConfigAdvanced, "Edit ports, scale, and paths"),
	})
	m.list.Select(1)
	m.appendOut("Env saved — choose config: Use defaults, or Advanced.")
	m.layout()
	return m, nil
}

func (m model) updateSetupChoice(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyPressMsg:
		switch {
		case msg.String() == "ctrl+c":
			return m, tea.Quit
		case isEsc(msg), msg.String() == "q":
			m.appendOut("Setup paused after .env — open Settings from More, or re-run Setup.")
			m.fromMore = false
			return m.closeBuilder()
		case isEnter(msg):
			return m.activateSetupChoice()
		}
	}
	var cmd tea.Cmd
	m.list, cmd = m.list.Update(msg)
	return m, cmd
}

func (m model) activateSetupChoice() (tea.Model, tea.Cmd) {
	item, ok := ui.SelectedItem(m.list)
	if !ok {
		return m, nil
	}
	switch item.Title() {
	case pickBack:
		m.appendOut("Setup paused after .env — open Settings from More, or re-run Setup.")
		m.fromMore = false
		return m.closeBuilder()
	case choiceConfigDefaults:
		obsBefore := initui.ObservabilityEnabled()
		if err := initui.WriteConfigDefaults(); err != nil {
			m.appendOut("Config defaults failed: " + err.Error())
			return m, nil
		}
		m.appendOut("Wrote eip.config.yaml from defaults (backup path preserved).")
		m.fromMore = false
		m.exitBuilder()
		return m.afterDocApply(true, initui.ObservabilityEnabled() != obsBefore)
	case choiceConfigAdvanced:
		m.restoreOpsList()
		m.openConfigBuilder("SETTINGS", docConfigSetup)
		return m, m.builder.Init()
	}
	return m, nil
}

// afterDocApply reminds Start/Dev on greenfield, or queues apply CLIs when the stack is up.
func (m model) afterDocApply(withSecrets, obsChanged bool) (tea.Model, tea.Cmd) {
	jobs, note, start := m.planDocApply(withSecrets, obsChanged)
	if note != "" {
		m.appendOut(note)
	}
	if !start {
		m.returnToMoreOrMenu()
		return m, nil
	}
	m.pendingCLI = jobs
	return m.startNextPendingCLI()
}

// planDocApply decides post-Persist messaging and optional secrets/sync/repair jobs.
// Toggling the observability addon adds or removes services, which sync cannot do —
// only a stack deploy can, so repair follows to redeploy at the running source.
func (m model) planDocApply(withSecrets, obsChanged bool) (jobs []cliJob, note string, start bool) {
	stackOff := m.snap.Health == statusbar.LightOff || m.snap.Health == statusbar.LightRed
	if stackOff {
		return nil, "Next: Start or Dev to bring up the stack.", false
	}
	if !ops.Allowed(ops.Entry{Args: []string{"sync"}}, m.snap.Docker, m.snap.Health) {
		return nil, "Stack looks present — apply via Command (secrets / sync) when Docker is ready.", false
	}
	if withSecrets {
		jobs = append(jobs, cliJob{Label: "secrets", Args: []string{"secrets"}})
	}
	jobs = append(jobs, cliJob{Label: "sync", Args: []string{"sync"}})
	if obsChanged {
		// Repair is menu-gated to unhealthy stacks; a healthy stack missing the
		// addon it was just told to run is exactly the case the gate excludes.
		jobs = append(jobs, cliJob{Label: "repair", Args: []string{"repair"}, Forced: true})
	}
	labels := make([]string, 0, len(jobs))
	for _, j := range jobs {
		labels = append(labels, j.Label)
	}
	note = "Applying to stack: " + strings.Join(labels, ", ") + "…"
	if obsChanged {
		note += " (observability changed — repair deploys the addon)"
	}
	return jobs, note, true
}
