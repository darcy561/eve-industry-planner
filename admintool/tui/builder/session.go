package builder

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/bubbles/list"
	"github.com/charmbracelet/bubbles/textinput"
	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	"eve-industry-planner/admintool/tui/theme"
	"eve-industry-planner/admintool/tui/ui"
)

type focusPane int

const (
	focusNav focusPane = iota
	focusForm
)

// Session is a nested wizard model: left section list, right active form.
type Session struct {
	Title    string // left panel title (e.g. INIT)
	sections []Section
	secIdx   int
	fieldIdx int
	focus    focusPane

	nav         list.Model
	navDelegate *ui.MarqueeDelegate
	inputs      []textinput.Model
	formVP      viewport.Model // right-pane scroll for long forms / wrapped help

	finishErr string // shown when Finish validation fails

	leftW  int
	rightW int
	bodyH  int
}

// NewSession builds a Session from sections (copies field values into inputs).
func NewSession(title string, sections []Section) Session {
	if title == "" {
		title = "SETUP"
	}
	secs := make([]Section, len(sections))
	copy(secs, sections)
	s := Session{
		Title:    title,
		sections: secs,
		focus:    focusNav,
		formVP:   ui.NewOutputViewport(""),
	}
	s.rebuildNav(30, 10)
	s.rebuildInputs()
	return s
}

// Sections returns the current section definitions (values may lag inputs until sync).
func (s Session) Sections() []Section {
	return s.sections
}

// ActiveIndex returns the selected section index.
func (s Session) ActiveIndex() int {
	return s.secIdx
}

// FocusForm reports whether the form (not nav) owns keys.
func (s Session) FocusForm() bool {
	return s.focus == focusForm
}

// SetFinishError shows an error banner (keeps the wizard open).
func (s *Session) SetFinishError(msg string) {
	s.finishErr = strings.TrimSpace(msg)
}

// AdvanceMarquee ticks the section-list marquee selection.
func (s *Session) AdvanceMarquee() {
	if s.navDelegate != nil {
		s.navDelegate.Advance(s.nav.Index())
	}
}

// SetSize updates panel geometry and resizes nav / inputs / form viewport.
func (s *Session) SetSize(leftW, rightW, bodyH int) {
	s.leftW, s.rightW, s.bodyH = leftW, rightW, bodyH
	listW, listH := ui.ListSizeInPanel(leftW, bodyH)
	if s.navDelegate == nil {
		s.rebuildNav(listW, listH)
	} else {
		ui.SizeList(&s.nav, s.navDelegate, listW, listH)
	}
	innerW, _ := ui.PanelInnerSize(rightW, bodyH)
	for i := range s.inputs {
		s.inputs[i].Width = theme.Max(8, innerW-4)
	}
	s.sizeFormViewport()
	s.refreshFormViewport()
	s.ensureFieldVisible()
}

// Collect syncs inputs and returns all field values + Autogen generate flags.
// PendingRoll forces generate=true for that key (buffer unchanged until Persist).
func (s *Session) Collect() (values map[string]string, generate map[string]bool) {
	s.syncValuesFromInputs()
	values = make(map[string]string)
	generate = make(map[string]bool)
	for _, sec := range s.sections {
		for _, f := range sec.Fields {
			if f.ID == "" {
				continue
			}
			values[f.ID] = f.Value
			if f.Autogen && !f.Locked {
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

func (s *Session) fieldEditable(f Field) bool {
	if f.Kind == KindReadonly || f.Kind == KindBool || f.Locked {
		return false
	}
	if f.Autogen && f.AutogenOn {
		return false // generate-on-save: no manual input
	}
	return true
}

func (s *Session) rebuildInputs() {
	sec := s.currentSection()
	s.inputs = make([]textinput.Model, len(sec.Fields))
	innerW, _ := ui.PanelInnerSize(s.rightW, s.bodyH)
	for i, f := range sec.Fields {
		ti := textinput.New()
		ti.Placeholder = f.Help
		ti.CharLimit = 512
		ti.SetValue(f.Value)
		ti.Prompt = ""
		ti.Width = theme.Max(8, innerW-4)
		if f.Kind == KindSecret {
			ti.EchoMode = textinput.EchoPassword
			ti.EchoCharacter = '•'
		}
		s.inputs[i] = ti
	}
	if s.fieldIdx < 0 || s.fieldIdx >= len(sec.Fields) {
		s.fieldIdx = 0
	}
	s.blurAllInputs()
}

func (s Session) currentSection() Section {
	if len(s.sections) == 0 {
		return Section{}
	}
	i := s.secIdx
	if i < 0 {
		i = 0
	}
	if i >= len(s.sections) {
		i = len(s.sections) - 1
	}
	return s.sections[i]
}

func (s *Session) syncValuesFromInputs() {
	if s.secIdx < 0 || s.secIdx >= len(s.sections) {
		return
	}
	fields := s.sections[s.secIdx].Fields
	for i := range fields {
		if i < len(s.inputs) && s.fieldEditable(fields[i]) {
			fields[i].Value = s.inputs[i].Value()
		}
	}
	s.sections[s.secIdx].Fields = fields
}

func (s *Session) selectSection(idx int) {
	if idx < 0 || idx >= len(s.sections) || idx == s.secIdx {
		return
	}
	s.syncValuesFromInputs()
	s.secIdx = idx
	s.nav.Select(idx)
	s.fieldIdx = 0
	s.rebuildInputs()
	s.formVP.GotoTop()
	s.refreshFormViewport()
}

func (s *Session) blurAllInputs() {
	for i := range s.inputs {
		s.inputs[i].Blur()
	}
}

func (s *Session) focusField(i int) tea.Cmd {
	if len(s.inputs) == 0 {
		return nil
	}
	if i < 0 {
		i = 0
	}
	if i >= len(s.inputs) {
		i = len(s.inputs) - 1
	}
	s.blurAllInputs()
	s.fieldIdx = i
	s.ensureFieldVisible()
	f := s.sections[s.secIdx].Fields[i]
	if !s.fieldEditable(f) {
		return nil
	}
	s.inputs[i].Focus()
	return textinput.Blink
}

func (s *Session) sizeFormViewport() {
	if s.rightW <= 0 || s.bodyH <= 0 {
		return
	}
	vpW, vpH := ui.ViewportSizeInPanel(s.rightW, s.bodyH)
	ui.SizeViewport(&s.formVP, vpW, vpH)
}

func (s *Session) refreshFormViewport() {
	s.sizeFormViewport()
	ui.SetViewportText(&s.formVP, s.renderForm(), false)
}

// ensureFieldVisible scrolls the form viewport so the ▸ field stays in view.
func (s *Session) ensureFieldVisible() {
	s.refreshFormViewport()
	h := s.formVP.Height
	if h <= 0 {
		return
	}
	raw := ui.SoftWrap(s.renderForm(), theme.Max(8, s.formVP.Width))
	focusLine := 0
	for i, line := range strings.Split(raw, "\n") {
		if strings.Contains(line, "▸") {
			focusLine = i
			break
		}
	}
	y := s.formVP.YOffset
	if focusLine < y {
		s.formVP.SetYOffset(focusLine)
	} else if focusLine >= y+h {
		s.formVP.SetYOffset(focusLine - h + 1)
	}
}

func (s *Session) toggleBool() {
	if s.secIdx < 0 || s.secIdx >= len(s.sections) {
		return
	}
	fields := s.sections[s.secIdx].Fields
	if s.fieldIdx < 0 || s.fieldIdx >= len(fields) {
		return
	}
	if fields[s.fieldIdx].Kind != KindBool {
		return
	}
	s.syncValuesFromInputs()
	fields = s.sections[s.secIdx].Fields
	if strings.EqualFold(strings.TrimSpace(fields[s.fieldIdx].Value), "true") {
		fields[s.fieldIdx].Value = "false"
	} else {
		fields[s.fieldIdx].Value = "true"
	}
	s.sections[s.secIdx].Fields = fields
	s.rebuildInputs()
}

func (s *Session) toggleAutogen() {
	if s.secIdx < 0 || s.secIdx >= len(s.sections) {
		return
	}
	fields := s.sections[s.secIdx].Fields
	if s.fieldIdx < 0 || s.fieldIdx >= len(fields) {
		return
	}
	f := fields[s.fieldIdx]
	if !f.Autogen || f.Locked {
		return
	}
	s.syncValuesFromInputs()
	fields = s.sections[s.secIdx].Fields
	fields[s.fieldIdx].AutogenOn = !fields[s.fieldIdx].AutogenOn
	if fields[s.fieldIdx].AutogenOn {
		fields[s.fieldIdx].PendingRoll = false
	}
	s.sections[s.secIdx].Fields = fields
	s.refreshFieldStatus(s.secIdx, s.fieldIdx)
	s.rebuildInputs()
}

func (s *Session) toggleRoll() {
	if s.secIdx < 0 || s.secIdx >= len(s.sections) {
		return
	}
	fields := s.sections[s.secIdx].Fields
	if s.fieldIdx < 0 || s.fieldIdx >= len(fields) {
		return
	}
	f := fields[s.fieldIdx]
	if !f.Autogen || f.Locked {
		return
	}
	s.syncValuesFromInputs()
	fields = s.sections[s.secIdx].Fields
	fields[s.fieldIdx].PendingRoll = !fields[s.fieldIdx].PendingRoll
	if fields[s.fieldIdx].PendingRoll {
		fields[s.fieldIdx].AutogenOn = false // roll is one-shot; keep typed buffer until Finish
	}
	s.sections[s.secIdx].Fields = fields
	s.refreshFieldStatus(s.secIdx, s.fieldIdx)
	s.rebuildInputs()
}

func (s *Session) refreshFieldStatus(secIdx, fieldIdx int) {
	if secIdx < 0 || secIdx >= len(s.sections) {
		return
	}
	fields := s.sections[secIdx].Fields
	if fieldIdx < 0 || fieldIdx >= len(fields) {
		return
	}
	f := &fields[fieldIdx]
	switch {
	case f.Locked:
		f.Status = "Locked — value cannot be changed here"
	case f.PendingRoll:
		f.Status = "Will roll on save (current value kept until then)"
	case f.Autogen && f.AutogenOn:
		f.Status = "Will generate on save"
	default:
		// leave Status for caller/initui; clear roll/gen hints
		if strings.HasPrefix(f.Status, "Will roll") || strings.HasPrefix(f.Status, "Will generate") {
			f.Status = ""
		}
	}
	s.sections[secIdx].Fields = fields
}

// Init implements tea.Model.
func (s Session) Init() tea.Cmd {
	return nil
}

// Update handles builder keys. Returns CancelMsg / DoneMsg for the parent.
func (s Session) Update(msg tea.Msg) (Session, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch {
		case msg.String() == "ctrl+c", msg.Type == tea.KeyCtrlC:
			return s, tea.Quit
		case msg.String() == "ctrl+enter", msg.String() == "ctrl+s", msg.Type == tea.KeyCtrlS:
			s.syncValuesFromInputs()
			s.finishErr = ""
			return s, func() tea.Msg { return DoneMsg{} }
		case msg.Type == tea.KeyEsc || msg.String() == "esc" || msg.String() == "escape":
			if s.focus == focusForm {
				s.focus = focusNav
				s.blurAllInputs()
				return s, nil
			}
			s.syncValuesFromInputs()
			return s, func() tea.Msg { return CancelMsg{} }
		case msg.String() == " ":
			if s.focus == focusForm && s.secIdx >= 0 && s.secIdx < len(s.sections) {
				fields := s.sections[s.secIdx].Fields
				if s.fieldIdx >= 0 && s.fieldIdx < len(fields) {
					if fields[s.fieldIdx].Kind == KindBool {
						s.toggleBool()
					} else {
						s.toggleAutogen()
					}
					return s, s.focusField(s.fieldIdx)
				}
			}
		case msg.String() == "ctrl+r":
			if s.focus == focusForm {
				s.toggleRoll()
				return s, s.focusField(s.fieldIdx)
			}
		case msg.String() == "tab":
			if s.focus == focusNav {
				s.focus = focusForm
				return s, s.focusField(0)
			}
			return s, s.advanceField(+1)
		case msg.String() == "shift+tab":
			if s.focus == focusForm {
				return s, s.advanceField(-1)
			}
			return s, nil
		case msg.Type == tea.KeyEnter || msg.String() == "enter" || msg.String() == "\r":
			if s.focus == focusNav {
				s.focus = focusForm
				return s, s.focusField(0)
			}
			return s, s.advanceField(+1)
		case msg.String() == "up", msg.Type == tea.KeyUp:
			if s.focus == focusForm {
				return s, s.advanceField(-1)
			}
		case msg.String() == "down", msg.Type == tea.KeyDown:
			if s.focus == focusForm {
				return s, s.advanceField(+1)
			}
		case msg.Type == tea.KeyPgUp, msg.String() == "pgup":
			if s.focus == focusForm {
				s.refreshFormViewport()
				s.formVP.HalfViewUp()
				return s, nil
			}
		case msg.Type == tea.KeyPgDown, msg.String() == "pgdown", msg.String() == "pgdn":
			if s.focus == focusForm {
				s.refreshFormViewport()
				s.formVP.HalfViewDown()
				return s, nil
			}
		}
	}

	if s.focus == focusNav {
		prev := s.nav.Index()
		var cmd tea.Cmd
		s.nav, cmd = s.nav.Update(msg)
		if s.nav.Index() != prev {
			s.selectSection(s.nav.Index())
		}
		return s, cmd
	}

	if len(s.inputs) == 0 {
		return s, nil
	}
	f := s.sections[s.secIdx].Fields[s.fieldIdx]
	if !s.fieldEditable(f) {
		return s, nil
	}
	var cmd tea.Cmd
	s.inputs[s.fieldIdx], cmd = s.inputs[s.fieldIdx].Update(msg)
	// Live value back into field for status helpers (parent may refresh Status).
	fields := s.sections[s.secIdx].Fields
	fields[s.fieldIdx].Value = s.inputs[s.fieldIdx].Value()
	if fields[s.fieldIdx].Validate != nil {
		if st := fields[s.fieldIdx].Validate(fields[s.fieldIdx].Value); st != "" {
			fields[s.fieldIdx].Status = st
		}
	}
	s.sections[s.secIdx].Fields = fields
	return s, cmd
}

func (s *Session) advanceField(delta int) tea.Cmd {
	if len(s.inputs) == 0 {
		return nil
	}
	next := s.fieldIdx + delta
	if next < 0 {
		s.focus = focusNav
		s.blurAllInputs()
		return nil
	}
	if next >= len(s.inputs) {
		next = len(s.inputs) - 1
	}
	return s.focusField(next)
}

// Help is the footer hint line for home.
func (s Session) Help() string {
	if s.focus == focusForm {
		return "↑↓ fields   pgup/pgdn scroll   space toggle   ctrl+r roll   tab next   esc sections   ctrl+enter finish   ctrl+c quit"
	}
	return "↑↓ sections   enter edit   ctrl+enter finish   esc back   ctrl+c quit"
}

// View renders both panels (nav | form) for the current size.
func (s Session) View() string {
	left := ui.RenderPanel(s.Title, s.nav.View(), s.leftW, s.bodyH)
	right := ui.RenderPanel(s.rightTitle(), s.formViewportView(), s.rightW, s.bodyH)
	return ui.JoinPanes(left, right)
}

// formViewportView sizes the form viewport and returns the visible window.
func (s Session) formViewportView() string {
	vp := s.formVP
	vpW, vpH := ui.ViewportSizeInPanel(s.rightW, s.bodyH)
	ui.SizeViewport(&vp, vpW, vpH)
	ui.SetViewportText(&vp, s.renderForm(), false)
	return vp.View()
}

func (s Session) rightTitle() string {
	sec := s.currentSection()
	if sec.Title == "" {
		return "FORM"
	}
	return strings.ToUpper(sec.Title)
}

func (s Session) renderForm() string {
	sec := s.currentSection()
	innerW, _ := ui.PanelInnerSize(s.rightW, s.bodyH)
	var b strings.Builder
	if s.finishErr != "" {
		errStyle := lipgloss.NewStyle().Foreground(lipgloss.Color("196")).Bold(true)
		b.WriteString(errStyle.Width(theme.Max(8, innerW-2)).Render(s.finishErr))
		b.WriteString("\n\n")
	}
	if sec.Help != "" {
		b.WriteString(theme.MutedText(sec.Help))
		b.WriteString("\n\n")
	}
	if len(sec.Fields) == 0 {
		b.WriteString(theme.MutedText("(no fields in this section)"))
		return b.String()
	}
	labelStyle := lipgloss.NewStyle().Foreground(theme.Title).Bold(true)
	helpStyle := lipgloss.NewStyle().Foreground(theme.Muted)
	okStyle := lipgloss.NewStyle().Foreground(lipgloss.Color("78"))
	warnStyle := lipgloss.NewStyle().Foreground(lipgloss.Color("214"))
	for i, f := range sec.Fields {
		cursor := "  "
		if s.focus == focusForm && i == s.fieldIdx {
			cursor = lipgloss.NewStyle().Foreground(theme.Primary).Bold(true).Render("▸ ")
		}
		b.WriteString(cursor)
		b.WriteString(labelStyle.Render(f.Label))
		if f.Locked || f.Kind == KindReadonly {
			b.WriteString(helpStyle.Render(" (read-only)"))
		}
		b.WriteByte('\n')

		if f.Kind == KindBool {
			check := "[ ]"
			if strings.EqualFold(strings.TrimSpace(f.Value), "true") {
				check = "[x]"
			}
			b.WriteString("  ")
			b.WriteString(helpStyle.Render(check + " Enabled (space)"))
			b.WriteByte('\n')
		} else if f.Autogen && !f.Locked {
			check := "[ ]"
			if f.AutogenOn {
				check = "[x]"
			}
			b.WriteString("  ")
			b.WriteString(helpStyle.Render(check + " Autogen (generate on save)"))
			b.WriteByte('\n')
			roll := "[ ]"
			if f.PendingRoll {
				roll = "[x]"
			}
			b.WriteString("  ")
			b.WriteString(helpStyle.Render(roll + " Roll once on save (ctrl+r)"))
			b.WriteByte('\n')
		}

		if f.Kind == KindBool {
			// value shown via checkbox only
		} else if f.Autogen && f.AutogenOn && !f.Locked && !f.PendingRoll {
			b.WriteString("  ")
			b.WriteString(okStyle.Render("(value will be generated on finish)"))
			b.WriteByte('\n')
		} else if i < len(s.inputs) {
			b.WriteString("  ")
			b.WriteString(s.inputs[i].View())
			b.WriteByte('\n')
		} else {
			b.WriteString("  ")
			b.WriteString(f.Value)
			b.WriteByte('\n')
		}

		if f.Status != "" {
			st := helpStyle
			low := strings.ToLower(f.Status)
			if strings.Contains(low, "invalid") || strings.Contains(low, "must") ||
				strings.Contains(low, "not writable") || strings.Contains(low, "permission") {
				st = warnStyle
			} else if strings.HasPrefix(f.Status, "Will generate") || strings.HasPrefix(f.Status, "Will roll") ||
				strings.HasPrefix(f.Status, "OK") {
				st = okStyle
			}
			b.WriteString(st.Width(theme.Max(8, innerW-2)).Render("  " + f.Status))
			b.WriteByte('\n')
		} else if f.Help != "" && (s.focus != focusForm || i != s.fieldIdx) {
			b.WriteString(helpStyle.Width(theme.Max(8, innerW-2)).Render("  " + f.Help))
			b.WriteByte('\n')
		}
		b.WriteByte('\n')
	}
	b.WriteString(theme.MutedText(fmt.Sprintf("Section %d/%d", s.secIdx+1, len(s.sections))))
	return b.String()
}
