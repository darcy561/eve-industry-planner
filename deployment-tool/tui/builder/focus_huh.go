package builder

import (
	tea "charm.land/bubbletea/v2"
	"charm.land/huh/v2"
)

// editHuhKey is the huh widget key to focus for editing / activating field i.
func (s *Session) editHuhKey(i int) string {
	fields := s.currentSection().Fields
	if i < 0 || i >= len(fields) {
		return ""
	}
	f := fields[i]
	switch {
	case f.Kind == KindBool:
		return f.ID
	case f.canAutogen() && f.AutogenOn:
		return f.ID + ":autogen"
	case f.canAutogen() && !f.AutogenOn:
		return f.ID // Value input
	case f.canRoll() && !fieldEditable(f):
		return f.ID + ":roll"
	default:
		return f.ID
	}
}

// jumpHuhToField advances the settled form until the target widget is focused.
// Must run after rebuildForm/settleForm (Init leaves focus on the first field).
func (s *Session) jumpHuhToField(logicalIdx int) {
	if s.form == nil || s.form.State != huh.StateNormal {
		return
	}
	want := s.editHuhKey(logicalIdx)
	if want == "" {
		return
	}
	for range 64 {
		ff := s.form.GetFocusedField()
		if ff == nil {
			return
		}
		if ff.GetKey() == want {
			return
		}
		prev := ff.GetKey()
		model, cmd := s.form.Update(huh.NextField())
		if f, ok := model.(*huh.Form); ok {
			s.form = f
		}
		if s.form.State != huh.StateNormal {
			// Walked past the last field — restore a settled form on first field.
			_ = s.rebuildForm()
			return
		}
		s.settleForm(cmd)
		ff = s.form.GetFocusedField()
		if ff == nil || ff.GetKey() == prev {
			return
		}
	}
}

// scrollFocusedFieldIntoView nudges the form viewport so the focused logical
// field's band is visible after a click / jump.
func (s *Session) scrollFocusedFieldIntoView(logicalIdx int) {
	bands := s.fieldBands()
	if logicalIdx < 0 || logicalIdx >= len(bands) {
		return
	}
	b := bands[logicalIdx]
	h := s.formVP.Height()
	if h <= 0 {
		return
	}
	y := s.formVP.YOffset()
	if b.start < y {
		s.formVP.SetYOffset(b.start)
		return
	}
	if b.end > y+h {
		s.formVP.SetYOffset(max(0, b.end-h))
	}
}

func (s *Session) applyFieldFocus(logicalIdx int) tea.Cmd {
	sec := s.currentSection()
	if len(sec.Fields) == 0 {
		return s.focusFinish()
	}
	s.finishFocused = false
	s.focus = focusForm
	s.fieldIdx = max(0, min(logicalIdx, len(sec.Fields)-1))

	// Already on the right widget — avoid rebuild flicker.
	if s.form != nil && s.form.State == huh.StateNormal {
		if ff := s.form.GetFocusedField(); ff != nil && ff.GetKey() == s.editHuhKey(s.fieldIdx) {
			s.scrollFocusedFieldIntoView(s.fieldIdx)
			s.syncFormVPContent()
			return nil
		}
	}

	cmd := s.rebuildForm()
	s.jumpHuhToField(s.fieldIdx)
	s.scrollFocusedFieldIntoView(s.fieldIdx)
	s.syncFormVPContent()
	return cmd
}
