package home

import (
	"context"

	"github.com/charmbracelet/bubbles/list"
	tea "github.com/charmbracelet/bubbletea"

	"eve-industry-planner/admintool/internal/kit"
	"eve-industry-planner/admintool/tui/ops"
	initui "eve-industry-planner/admintool/tui/screens/init"
	"eve-industry-planner/admintool/tui/ui"

	statusbar "eve-industry-planner/admintool/tui/status"
)

func (m *model) openSetupBuilder() {
	m.fromMore = false
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
	ops.ApplyDockerGate(&m.list, m.snap.Docker)
}

func (m model) onBuilderDone() (tea.Model, tea.Cmd) {
	switch m.docKind {
	case docEnvSetup, docEnvEdit:
		if err := initui.PersistEnv(&m.builder); err != nil {
			m.builder.SetFinishError(err.Error())
			return m, nil
		}
		m.appendOutBlank("Wrote .env (and cli.env_backup_path on eip.config.yaml).")
		if m.docKind == docEnvSetup {
			return m.openSetupConfigChoice()
		}
		m.exitBuilder()
		return m.afterDocApply(true)
	case docConfigSetup, docConfigEdit:
		if err := initui.PersistConfig(&m.builder); err != nil {
			m.builder.SetFinishError(err.Error())
			return m, nil
		}
		m.appendOutBlank("Wrote eip.config.yaml.")
		withSecrets := m.docKind == docConfigSetup
		m.exitBuilder()
		return m.afterDocApply(withSecrets)
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
		ui.NewItem(choiceConfigDefaults, "Write starter settings (keeps backup path)"),
		ui.NewItem(choiceConfigAdvanced, "Edit ports, scale, and paths"),
	})
	m.list.Select(0)
	m.appendOut("Env saved — choose config: Use defaults, or Advanced.")
	m.layout()
	return m, nil
}

func (m model) updateSetupChoice(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch {
		case msg.String() == "ctrl+c":
			return m, tea.Quit
		case isEsc(msg), msg.String() == "q":
			m.appendOut("Setup paused after .env — open Settings from More, or re-run Setup.")
			m.fromMore = false
			return m.closeBuilder()
		case isEnter(msg):
			item, ok := ui.SelectedItem(m.list)
			if !ok {
				return m, nil
			}
			switch item.Title() {
			case choiceConfigDefaults:
				if err := initui.WriteConfigDefaults(); err != nil {
					m.appendOut("Config defaults failed: " + err.Error())
					return m, nil
				}
				m.appendOut("Wrote eip.config.yaml from defaults (backup path preserved).")
				m.fromMore = false
				m.exitBuilder()
				return m.afterDocApply(true)
			case choiceConfigAdvanced:
				m.restoreOpsList()
				m.openConfigBuilder("SETTINGS", docConfigSetup)
				return m, m.builder.Init()
			}
		}
	}
	var cmd tea.Cmd
	m.list, cmd = m.list.Update(msg)
	return m, cmd
}

// afterDocApply reminds Start/Dev on greenfield, or queues apply CLIs when the stack is up.
func (m model) afterDocApply(withSecrets bool) (tea.Model, tea.Cmd) {
	stackOff := m.snap.Health == statusbar.LightOff || m.snap.Health == statusbar.LightRed
	if stackOff {
		m.appendOut("Next: Start or Dev to bring up the stack.")
		m.returnToMoreOrMenu()
		return m, nil
	}
	if !ops.Allowed(ops.Entry{Args: []string{"sync"}}, m.snap.Docker) {
		m.appendOut("Stack looks present — apply via Command (secrets / sync) when Docker is ready.")
		m.returnToMoreOrMenu()
		return m, nil
	}
	m.pendingCLI = nil
	if withSecrets {
		m.appendOut("Applying to stack: secrets, then sync…")
		m.pendingCLI = append(m.pendingCLI, cliJob{Label: "secrets", Args: []string{"secrets"}})
	} else {
		m.appendOut("Applying to stack: sync…")
	}
	m.pendingCLI = append(m.pendingCLI, cliJob{Label: "sync", Args: []string{"sync"}})
	return m.startNextPendingCLI()
}
