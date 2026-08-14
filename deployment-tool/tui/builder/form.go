package builder

import (
	"fmt"
	"reflect"
	"strings"

	"charm.land/bubbles/v2/key"
	tea "charm.land/bubbletea/v2"
	"charm.land/huh/v2"
	"charm.land/lipgloss/v2"

	"eve-industry-planner/deployment-tool/tui/theme"
	"eve-industry-planner/deployment-tool/tui/ui"
)

// formBinds holds live pointer targets for the active section's huh fields.
// Autogen/Roll use MultiSelect values (checkbox); non-empty means checked.
type formBinds struct {
	values  []string
	bools   []bool
	autogen [][]string
	roll    [][]string
}

const checkboxOn = "on"

func checkboxValue(on bool) []string {
	if on {
		return []string{checkboxOn}
	}
	return nil
}

func checkboxChecked(sel []string) bool {
	return len(sel) > 0
}

func boolCheckbox(key, label string, selected *[]string) huh.Field {
	// Single-option MultiSelect renders as [ ] / [x] (huh has no Checkbox field).
	return huh.NewMultiSelect[string]().
		Key(key).
		Options(huh.NewOption(label, checkboxOn)).
		Value(selected).
		Filterable(false).
		Limit(1)
}

func (s *Session) rebuildForm() tea.Cmd {
	sec := s.currentSection()
	n := len(sec.Fields)
	b := formBinds{
		values:  make([]string, n),
		bools:   make([]bool, n),
		autogen: make([][]string, n),
		roll:    make([][]string, n),
	}
	for i, f := range sec.Fields {
		b.values[i] = f.Value
		b.bools[i] = strings.EqualFold(strings.TrimSpace(f.Value), "true")
		b.autogen[i] = checkboxValue(f.AutogenOn)
		b.roll[i] = checkboxValue(f.PendingRoll)
	}
	s.binds = b

	fields := make([]huh.Field, 0, n*3+2)
	if s.finishErr != "" {
		fields = append(fields, huh.NewNote().Title("Finish error").Description(s.finishErr))
	}
	if sec.Help != "" {
		fields = append(fields, huh.NewNote().Title(sec.Title).Description(sec.Help))
	}
	for i, f := range sec.Fields {
		fields = append(fields, s.huhFieldsFor(i, f)...)
	}
	if len(fields) == 0 {
		fields = append(fields, huh.NewNote().Description("(no fields in this section)"))
	}

	innerW, _ := ui.PanelInnerSize(s.rightW, s.bodyH)
	km := huh.NewDefaultKeyMap()
	// Last field disables Next; Tab must Submit so we can land on Finish.
	tabSubmit := key.NewBinding(key.WithKeys("enter", "tab"), key.WithHelp("enter", "next"))
	km.Input.Submit = tabSubmit
	km.Confirm.Submit = tabSubmit
	km.MultiSelect.Submit = tabSubmit
	// Single-option checkboxes must not trap ↑↓ (used for field / section nav).
	km.MultiSelect.Up = key.NewBinding(key.WithDisabled())
	km.MultiSelect.Down = key.NewBinding(key.WithDisabled())

	// No WithHeight: huh's group viewport + PgUp/PgDn was blanking the pane.
	// We scroll the full form content via Session.formVP instead.
	form := huh.NewForm(huh.NewGroup(fields...)).
		WithTheme(eipHuhTheme()).
		WithKeyMap(km).
		WithWidth(max(20, innerW-2)).
		WithShowHelp(false).
		WithShowErrors(true)
	form.SubmitCmd = nil
	form.CancelCmd = nil
	s.form = form
	// Settle Init now — if we return Init as a Cmd while focus is the section
	// list, those msgs hit the nav model and the form stays blank forever.
	s.settleForm(initHuhForm(form))
	if s.form != nil && s.form.State != huh.StateNormal {
		// All-skip Init marks the form quitting (blank View). Rebuild a static
		// note group and skip Init so content stays visible.
		s.form = huh.NewForm(huh.NewGroup(fields...)).
			WithTheme(eipHuhTheme()).
			WithWidth(max(20, innerW-2)).
			WithShowHelp(false).
			WithShowErrors(false)
		s.form.SubmitCmd = nil
		s.form.CancelCmd = nil
	}
	s.syncFormVPContent()
	return nil
}

// initHuhForm focuses the form without tea.RequestWindowSize.
// huh.Form.Init always appends a size query; home already sets geometry via
// SetSize / WithWidth / WithHeight. Re-querying re-enters layout → SetSize →
// rebuildForm and can spin until the process dies (tall forms rebuild often).
func initHuhForm(form *huh.Form) tea.Cmd {
	if form == nil {
		return nil
	}
	return withoutWindowSizeRequest(form.Init())
}

func withoutWindowSizeRequest(cmd tea.Cmd) tea.Cmd {
	if cmd == nil {
		return nil
	}
	msg := cmd()
	if msg == nil {
		return nil
	}
	switch msg := msg.(type) {
	case tea.BatchMsg:
		return tea.Batch(filterWindowSizeCmds([]tea.Cmd(msg))...)
	default:
		if cmds, ok := cmdsFromMsg(msg); ok {
			return tea.Sequence(filterWindowSizeCmds(cmds)...)
		}
		if isWindowSizeMsg(msg) {
			return nil
		}
		return func() tea.Msg { return msg }
	}
}

func filterWindowSizeCmds(cmds []tea.Cmd) []tea.Cmd {
	out := make([]tea.Cmd, 0, len(cmds))
	for _, c := range cmds {
		if c == nil || isWindowSizeRequest(c) {
			continue
		}
		out = append(out, c)
	}
	return out
}

func isWindowSizeRequest(c tea.Cmd) bool {
	return reflect.ValueOf(c).Pointer() == reflect.ValueOf(tea.RequestWindowSize).Pointer()
}

func isWindowSizeMsg(msg tea.Msg) bool {
	return reflect.TypeOf(msg) == reflect.TypeOf(tea.RequestWindowSize())
}

func cmdsFromMsg(msg tea.Msg) ([]tea.Cmd, bool) {
	rv := reflect.ValueOf(msg)
	if rv.Kind() != reflect.Slice || rv.Type().Elem() != reflect.TypeFor[tea.Cmd]() {
		return nil, false
	}
	out := make([]tea.Cmd, rv.Len())
	for i := range out {
		out[i], _ = rv.Index(i).Interface().(tea.Cmd)
	}
	return out, true
}

func (s *Session) huhFieldsFor(i int, f Field) []huh.Field {
	status := f.Status
	if status == "" {
		status = f.Help
	}

	if f.Kind == KindBool {
		yes, no := "Enabled", "Disabled"
		if f.BoolYes != "" {
			yes = f.BoolYes
		}
		if f.BoolNo != "" {
			no = f.BoolNo
		}
		return []huh.Field{huh.NewConfirm().
			Key(f.ID).
			Title(f.Label).
			Description(status).
			Affirmative(yes).
			Negative(no).
			Value(&s.binds.bools[i])}
	}

	var out []huh.Field
	// Locked / day-2 rollable secrets: show value like a disabled input.
	disabled := f.Kind == KindReadonly || f.Locked || (f.AllowRoll && !f.Autogen)
	if disabled {
		out = append(out, s.valueInput(i, f, lockedStatus(status), f.Label))
		if f.AllowRoll && !f.Locked {
			out = append(out, boolCheckbox(f.ID+":roll", "Roll "+f.Label+" on save (ctrl+r)", &s.binds.roll[i]))
		}
		return out
	}

	// First-create Autogen: checkbox first; hide the typing box while checked.
	if f.Autogen && !f.Locked {
		out = append(out, huh.NewNote().Title(f.Label).Description(status))
		out = append(out, boolCheckbox(f.ID+":autogen", "Autogen on save", &s.binds.autogen[i]))
		if checkboxChecked(s.binds.autogen[i]) {
			out = append(out, huh.NewNote().Description("(will be generated on finish — uncheck Autogen to type a value)"))
		} else {
			out = append(out, s.valueInput(i, f, status, "Value"))
		}
		if f.AllowRoll {
			out = append(out, boolCheckbox(f.ID+":roll", "Roll "+f.Label+" on save (ctrl+r)", &s.binds.roll[i]))
		}
		return out
	}

	out = append(out, s.valueInput(i, f, status, f.Label))
	if f.AllowRoll && !f.Locked {
		out = append(out, boolCheckbox(f.ID+":roll", "Roll "+f.Label+" on save (ctrl+r)", &s.binds.roll[i]))
	}
	return out
}

func lockedStatus(status string) string {
	if status == "" || strings.HasPrefix(status, "Locked") {
		return "Locked — not editable"
	}
	return status
}

func (s *Session) valueInput(i int, f Field, status, title string) huh.Field {
	if title == "" {
		title = f.Label
	}
	return huh.NewInput().
		Key(f.ID).
		Title(title).
		Description(status).
		Value(&s.binds.values[i]).
		CharLimit(512)
}

func (s *Session) syncFromBinds() {
	if s.secIdx < 0 || s.secIdx >= len(s.sections) {
		return
	}
	fields := s.sections[s.secIdx].Fields
	if len(s.binds.values) != len(fields) {
		return
	}
	for i := range fields {
		f := &fields[i]
		switch {
		case f.Kind == KindBool:
			if s.binds.bools[i] {
				f.Value = "true"
			} else {
				f.Value = "false"
			}
		case f.Kind != KindReadonly && !f.Locked:
			if !(f.Autogen && checkboxChecked(s.binds.autogen[i]) && !checkboxChecked(s.binds.roll[i])) {
				f.Value = s.binds.values[i]
			}
		}
		if f.Autogen && !f.Locked {
			f.AutogenOn = checkboxChecked(s.binds.autogen[i])
		}
		if f.AllowRoll && !f.Locked {
			f.PendingRoll = checkboxChecked(s.binds.roll[i])
		}
		// Mutual exclusion if both checkboxes are ever shown together.
		if f.AutogenOn && f.PendingRoll {
			f.PendingRoll = false
			s.binds.roll[i] = nil
		}
		if f.Validate != nil && fieldEditable(*f) {
			if st := f.Validate(f.Value); st != "" {
				f.Status = st
			}
		}
		applyFieldStatus(f)
	}
	s.sections[s.secIdx].Fields = fields
}

func applyFieldStatus(f *Field) {
	switch {
	case f.Locked:
		f.Status = "Locked — value cannot be changed here"
	case f.PendingRoll:
		if f.ID == "REFRESH_TOKEN_AES_KEY" {
			f.Status = "Will roll on save (version bumps; old key → legacy)"
		} else {
			f.Status = "Will roll on save (current value kept until then)"
		}
	case f.Autogen && f.AutogenOn:
		f.Status = "Will generate on save"
	case f.AllowRoll:
		if f.ID == "REFRESH_TOKEN_AES_KEY" {
			f.Status = "Set — Roll on save regenerates key, bumps version, keeps old key in legacy"
		} else {
			f.Status = "Set — check Roll on save to regenerate"
		}
	default:
		if strings.HasPrefix(f.Status, "Will roll") || strings.HasPrefix(f.Status, "Will generate") ||
			strings.HasPrefix(f.Status, "Set — check Roll") {
			f.Status = ""
		}
	}
}

func (s *Session) needsFormRebuild(before []Field) bool {
	after := s.currentSection().Fields
	if len(before) != len(after) {
		return true
	}
	for i := range after {
		if before[i].AutogenOn != after[i].AutogenOn || before[i].PendingRoll != after[i].PendingRoll {
			return true
		}
	}
	return false
}

func (s *Session) snapshotFields() []Field {
	src := s.currentSection().Fields
	out := make([]Field, len(src))
	copy(out, src)
	return out
}

func (s Session) formBodyView() string {
	s.syncFormVPContent()
	var b strings.Builder
	b.WriteString(s.formVP.View())
	b.WriteString("\n")
	b.WriteString(theme.MutedText(fmt.Sprintf("Section %d/%d", s.secIdx+1, max(len(s.sections), 1))))
	b.WriteString("\n\n")
	b.WriteString(s.renderBackControl())
	b.WriteString("\n")
	b.WriteString(s.renderFinishControl())
	return b.String()
}

func (s Session) renderBackControl() string {
	style := lipgloss.NewStyle().Foreground(theme.Primary).Bold(true)
	muted := lipgloss.NewStyle().Foreground(theme.Muted)
	label := style.Render("[ ← Back ]")
	hint := muted.Render("  esc / click")
	if s.focus == focusForm {
		hint = muted.Render("  to sections")
	} else {
		hint = muted.Render("  leave without saving")
	}
	return ui.Mark(ui.ZoneBack, "  "+label+hint)
}

func (s Session) renderFinishControl() string {
	cursor := "  "
	style := lipgloss.NewStyle().Foreground(theme.Primary).Bold(true)
	if s.focus == focusForm && s.finishFocused {
		cursor = style.Render("▸ ")
	}
	label := style.Render("[ Finish ]")
	hint := lipgloss.NewStyle().Foreground(theme.Muted).Render("  enter / ctrl+s / click")
	return ui.Mark(ui.ZoneFinish, cursor+label+hint)
}
