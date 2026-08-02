package builder

import (
	"strings"

	"charm.land/bubbles/v2/list"
	"charm.land/bubbles/v2/viewport"
	tea "charm.land/bubbletea/v2"
	"charm.land/huh/v2"

	"eve-industry-planner/admintool/tui/ui"
)

type focusPane int

const (
	focusNav focusPane = iota
	focusForm
)

// Session is a nested wizard: left section list, right huh form + Finish.
type Session struct {
	Title    string
	sections []Section
	secIdx   int
	fieldIdx int // fallback when huh focus key is empty (notes)
	focus    focusPane

	nav         list.Model
	navDelegate *ui.MarqueeDelegate
	form        *huh.Form
	formVP      viewport.Model
	binds       formBinds

	finishErr     string
	finishFocused bool
	tabToFinish   bool // tab (not ↑↓) advanced past last field → land on Finish

	leftW  int
	rightW int
	bodyH  int
}

// NewSession builds a Session from sections.
func NewSession(title string, sections []Section) Session {
	if title == "" {
		title = "SETUP"
	}
	secs := make([]Section, len(sections))
	copy(secs, sections)
	s := Session{Title: title, sections: secs, focus: focusNav}
	s.rebuildNav(30, 10)
	_ = s.rebuildForm()
	return s
}

func (s Session) Sections() []Section { return s.sections }
func (s Session) ActiveIndex() int    { return s.secIdx }
func (s Session) FocusForm() bool     { return s.focus == focusForm }

// FinishError is the Persist error banner text (empty when clear).
func (s Session) FinishError() string { return s.finishErr }

// SetFinishError shows an error banner and rebuilds the form.
func (s *Session) SetFinishError(msg string) tea.Cmd {
	s.finishErr = strings.TrimSpace(msg)
	return s.rebuildForm()
}

// SetSize updates panel geometry and rebuilds the huh form.
// Syncs live huh binds first so resize does not drop in-progress edits.
// Same dimensions with an existing form are a no-op so home layout /
// WindowSizeMsg cannot spin rebuild → Init → RequestWindowSize → layout.
func (s *Session) SetSize(leftW, rightW, bodyH int) tea.Cmd {
	s.syncFromBinds()
	same := s.form != nil && s.leftW == leftW && s.rightW == rightW && s.bodyH == bodyH
	s.leftW, s.rightW, s.bodyH = leftW, rightW, bodyH
	listW, listH := ui.ListSizeInPanel(leftW, bodyH)
	if s.navDelegate == nil {
		s.rebuildNav(listW, listH)
	} else {
		ui.SizeList(&s.nav, s.navDelegate, listW, listH)
	}
	s.sizeFormVP()
	if same {
		s.syncFormVPContent()
		return nil
	}
	return s.rebuildForm()
}

// Collect syncs huh binds and returns values + Autogen generate flags.
func (s *Session) Collect() (values map[string]string, generate map[string]bool) {
	s.syncFromBinds()
	values = make(map[string]string)
	generate = make(map[string]bool)
	for _, sec := range s.sections {
		for _, f := range sec.Fields {
			if f.ID == "" {
				continue
			}
			values[f.ID] = f.Value
			if (f.Autogen || f.AllowRoll) && !f.Locked {
				generate[f.ID] = f.AutogenOn || f.PendingRoll
			}
		}
	}
	return values, generate
}

func (s *Session) rebuildNav(width, height int) {
	items := make([]ui.Item, 0, len(s.sections))
	for _, sec := range s.sections {
		help := sec.Help
		if help == "" {
			help = sec.ID
		}
		items = append(items, ui.NewItem(sec.Title, help))
	}
	s.nav, s.navDelegate = ui.NewItemList(items, width, height)
	if s.secIdx >= 0 && s.secIdx < len(items) {
		s.nav.Select(s.secIdx)
	}
}

func fieldEditable(f Field) bool {
	if f.Kind == KindReadonly || f.Kind == KindBool || f.Locked {
		return false
	}
	return !(f.Autogen && f.AutogenOn && !f.PendingRoll)
}

func (s Session) currentSection() Section {
	if len(s.sections) == 0 {
		return Section{}
	}
	i := max(s.secIdx, 0)
	if i >= len(s.sections) {
		i = len(s.sections) - 1
	}
	return s.sections[i]
}

func (s *Session) selectSection(idx int) tea.Cmd {
	if idx < 0 || idx >= len(s.sections) || idx == s.secIdx {
		return nil
	}
	s.syncFromBinds()
	s.secIdx = idx
	s.nav.Select(idx)
	s.fieldIdx = 0
	s.finishFocused = false
	s.tabToFinish = false
	s.formVP.SetYOffset(0)
	return s.rebuildForm()
}

func (s *Session) focusField(i int) tea.Cmd {
	return s.applyFieldFocus(i)
}

func (s *Session) focusFinish() tea.Cmd {
	s.focus = focusForm
	s.finishFocused = true
	s.syncFromBinds()
	return nil
}

// goBack mirrors esc: form → sections; sections → CancelMsg.
func (s Session) goBack() (Session, tea.Cmd) {
	if s.focus == focusForm {
		s.focus = focusNav
		s.finishFocused = false
		s.syncFromBinds()
		return s, nil
	}
	s.syncFromBinds()
	return s, func() tea.Msg { return CancelMsg{} }
}

func (s *Session) emitDone() (Session, tea.Cmd) {
	s.syncFromBinds()
	s.finishErr = ""
	return *s, func() tea.Msg { return DoneMsg{} }
}

func (s *Session) focusedHuhKey() string {
	if s.form == nil {
		return ""
	}
	if ff := s.form.GetFocusedField(); ff != nil {
		return ff.GetKey()
	}
	return ""
}

func (s *Session) focusedFieldIndex() int {
	if key := s.focusedHuhKey(); key != "" {
		id, _, _ := strings.Cut(key, ":")
		for i, f := range s.currentSection().Fields {
			if f.ID == id || f.ID == key {
				return i
			}
		}
	}
	return s.fieldIdx
}

// mutateFieldAt syncs binds, applies mut to fields[i], rebuilds when mut returns true.
func (s *Session) mutateFieldAt(i int, mut func(f *Field) bool) tea.Cmd {
	if s.secIdx < 0 || s.secIdx >= len(s.sections) {
		return nil
	}
	s.syncFromBinds()
	fields := s.sections[s.secIdx].Fields
	if i < 0 || i >= len(fields) || !mut(&fields[i]) {
		return nil
	}
	applyFieldStatus(&fields[i])
	s.sections[s.secIdx].Fields = fields
	s.fieldIdx = i
	s.focus = focusForm
	s.finishFocused = false
	return s.rebuildForm()
}

func (s *Session) mutateFocusedField(mut func(f *Field) bool) tea.Cmd {
	return s.mutateFieldAt(s.focusedFieldIndex(), mut)
}

func (s *Session) toggleBool() tea.Cmd {
	return s.toggleBoolAt(s.focusedFieldIndex())
}

func (s *Session) toggleBoolAt(i int) tea.Cmd {
	return s.mutateFieldAt(i, func(f *Field) bool {
		if f.Kind != KindBool {
			return false
		}
		if strings.EqualFold(strings.TrimSpace(f.Value), "true") {
			f.Value = "false"
		} else {
			f.Value = "true"
		}
		return true
	})
}

func (s *Session) toggleAutogen() tea.Cmd {
	return s.toggleAutogenAt(s.focusedFieldIndex())
}

func (s *Session) toggleAutogenAt(i int) tea.Cmd {
	return s.mutateFieldAt(i, func(f *Field) bool {
		if !f.canAutogen() {
			return false
		}
		f.AutogenOn = !f.AutogenOn
		if f.AutogenOn {
			f.PendingRoll = false
		}
		return true
	})
}

func (s *Session) toggleRoll() tea.Cmd {
	return s.toggleRollAt(s.focusedFieldIndex())
}

func (s *Session) toggleRollAt(i int) tea.Cmd {
	return s.mutateFieldAt(i, func(f *Field) bool {
		if !f.canRoll() {
			return false
		}
		f.PendingRoll = !f.PendingRoll
		if f.PendingRoll {
			f.AutogenOn = false
		}
		return true
	})
}

func (s Session) Init() tea.Cmd {
	// Form content is settled inside rebuildForm/SetSize; nothing async to run.
	return nil
}

// Update handles builder keys. Returns CancelMsg / DoneMsg for the parent.
func (s Session) Update(msg tea.Msg) (Session, tea.Cmd) {
	switch msg := msg.(type) {
	case ui.MarqueeTickMsg:
		var cmd tea.Cmd
		s.nav, cmd = s.nav.Update(msg)
		return s, cmd
	case tea.KeyPressMsg:
		switch msg.String() {
		case "ctrl+c":
			return s, tea.Quit
		case "ctrl+enter", "ctrl+s":
			return s.emitDone()
		case "ctrl+shift+c":
			return s, s.CopyFocused()
		case "ctrl+v":
			if s.focus == focusForm && !s.finishFocused {
				return s, ui.PasteText()
			}
		case "esc", "escape":
			return s.goBack()
		case "space":
			if s.focus == focusForm && !s.finishFocused {
				fields := s.currentSection().Fields
				i := s.focusedFieldIndex()
				if i >= 0 && i < len(fields) {
					if fields[i].Kind == KindBool {
						return s, s.toggleBool()
					}
					if key := s.focusedHuhKey(); strings.HasSuffix(key, ":roll") {
						return s, s.toggleRoll()
					}
					if fields[i].canAutogen() {
						return s, s.toggleAutogen()
					}
					if fields[i].canRoll() {
						return s, s.toggleRoll()
					}
				}
			}
		case "ctrl+r":
			if s.focus == focusForm && !s.finishFocused {
				return s, s.toggleRoll()
			}
		case "pgup", "pgdown", "pageup", "pagedown":
			if s.focus == focusForm && !s.finishFocused {
				s.scrollFormPage(msg.String() == "pgup" || msg.String() == "pageup")
				return s, nil
			}
		case "up", "k":
			// Stay in the active pane — do not jump nav ↔ form at the ends.
			if s.focus == focusForm && !s.finishFocused {
				s.tabToFinish = false
				return s.forwardToForm(huh.PrevField())
			}
		case "down", "j":
			if s.focus == focusForm && !s.finishFocused {
				s.tabToFinish = false
				return s.forwardToForm(huh.NextField())
			}
		case "tab":
			if s.focus == focusNav {
				return s, s.focusField(0)
			}
			if s.finishFocused {
				return s, nil
			}
			if s.focus == focusForm {
				s.tabToFinish = true
			}
		case "shift+tab":
			if s.focus == focusForm && s.finishFocused {
				s.finishFocused = false
				return s, s.focusField(len(s.currentSection().Fields) - 1)
			}
		case "enter", "\r":
			if s.focus == focusNav {
				return s, s.focusField(0)
			}
			if s.finishFocused {
				return s.emitDone()
			}
		}
	case tea.ClipboardMsg:
		return s.forwardToForm(tea.PasteMsg{Content: msg.String()})
	case tea.PasteMsg:
		return s.forwardToForm(msg)
	case tea.MouseMsg:
		return s.HandleMouse(msg)
	}

	// Huh field-update msgs must reach the form even when the section list is focused.
	if s.form != nil {
		switch msg.(type) {
		case tea.KeyPressMsg, tea.MouseMsg, ui.MarqueeTickMsg:
		default:
			return s.forwardToForm(msg)
		}
	}

	if s.focus == focusNav {
		prev := s.nav.Index()
		var cmd tea.Cmd
		s.nav, cmd = s.nav.Update(msg)
		if s.nav.Index() != prev {
			return s, tea.Batch(cmd, s.selectSection(s.nav.Index()))
		}
		return s, cmd
	}
	if s.form == nil {
		return s, nil
	}
	if s.finishFocused {
		if _, ok := msg.(tea.KeyPressMsg); ok {
			return s, nil
		}
	}
	return s.forwardToForm(msg)
}

// sectionInteractive reports whether the active section has editable controls
// (inputs / Autogen / Roll). All-locked sections only show Notes — huh skips
// them and would otherwise dump focus on Finish, swallowing ↑↓ for the nav.
func (s Session) sectionInteractive() bool {
	for _, f := range s.currentSection().Fields {
		if f.canAutogen() || f.canRoll() || f.Kind == KindBool || fieldEditable(f) {
			return true
		}
	}
	return false
}

func (s Session) forwardToForm(msg tea.Msg) (Session, tea.Cmd) {
	if s.form == nil {
		return s, nil
	}
	before := s.snapshotFields()
	model, cmd := s.form.Update(msg)
	if f, ok := model.(*huh.Form); ok {
		s.form = f
	}
	s.syncFromBinds()
	s.fieldIdx = s.focusedFieldIndex()

	switch s.form.State {
	case huh.StateCompleted:
		wantFinish := s.tabToFinish
		s.tabToFinish = false
		initCmd := s.rebuildForm()
		if !s.sectionInteractive() {
			s.focus = focusNav
			s.finishFocused = false
			return s, initCmd
		}
		if wantFinish {
			s.finishFocused = true
			s.focus = focusForm
			return s, initCmd
		}
		// ↑↓ past the last field: stay on the form (do not jump panes / blank out).
		s.finishFocused = false
		s.focus = focusForm
		return s, initCmd
	case huh.StateAborted:
		return s, s.rebuildForm()
	}
	if cmd := s.revertLockedEdits(); cmd != nil {
		return s, cmd
	}
	if s.needsFormRebuild(before) {
		return s, s.rebuildForm()
	}
	s.syncFormVPContent()
	return s, cmd
}

// revertLockedEdits rebuilds when a locked/readonly input was typed into so the
// displayed value snaps back (disabled-field UX; huh has no read-only input).
func (s *Session) revertLockedEdits() tea.Cmd {
	if s.secIdx < 0 || s.secIdx >= len(s.sections) {
		return nil
	}
	for i, f := range s.sections[s.secIdx].Fields {
		if i >= len(s.binds.values) {
			break
		}
		disabled := f.Locked || f.Kind == KindReadonly || (f.AllowRoll && !f.Autogen)
		if disabled && s.binds.values[i] != f.Value {
			return s.rebuildForm()
		}
	}
	return nil
}

// CopyFocused sets the clipboard to the focused field value.
func (s Session) CopyFocused() tea.Cmd {
	if s.focus != focusForm || s.finishFocused {
		return nil
	}
	i := s.focusedFieldIndex()
	fields := s.currentSection().Fields
	if i < 0 || i >= len(fields) {
		return nil
	}
	val := fields[i].Value
	if i < len(s.binds.values) {
		val = s.binds.values[i]
	}
	return ui.CopyText(val)
}

func (s Session) Help() string {
	if s.focus == focusForm {
		return "↑↓ fields   tab Finish   click field   ctrl+shift+c copy field   F6 select text   ctrl+v paste   ctrl+s finish   esc sections"
	}
	return "↑↓ sections   enter/click edit   Back leave   F6 select text   ctrl+s finish   esc back"
}

func (s Session) View() string {
	left := ui.Mark(ui.ZonePaneNav, ui.RenderPanel(s.Title, s.nav.View(), s.leftW, s.bodyH))
	right := ui.Mark(ui.ZonePaneForm, ui.RenderPanel(s.rightTitle(), s.formBodyView(), s.rightW, s.bodyH))
	return ui.JoinPanes(left, right)
}

func (s Session) rightTitle() string {
	if sec := s.currentSection(); sec.Title != "" {
		return strings.ToUpper(sec.Title)
	}
	return "FORM"
}
