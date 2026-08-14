package builder

import (
	tea "charm.land/bubbletea/v2"
	zone "github.com/lrstanley/bubblezone/v2"

	"eve-industry-planner/deployment-tool/tui/ui"
)

// HandleMouse: nav / Back / Finish, form wheel scroll, and form clicks that
// toggle bools/checkboxes or focus text fields via per-field zones.
func (s Session) HandleMouse(msg tea.Msg) (Session, tea.Cmd) {
	if up, ok := ui.WheelDir(msg); ok {
		if mm, is := msg.(tea.MouseMsg); is {
			if _, hit := ui.Hit(mm, ui.ZonePaneForm); hit {
				s.focus = focusForm
				s.finishFocused = false
				if up {
					s.scrollFormLines(-3)
				} else {
					s.scrollFormLines(3)
				}
			}
		}
		return s, nil
	}

	click, ok := ui.IsLeftClick(msg)
	if !ok {
		return s, nil
	}

	ids := []string{ui.ZoneBack, ui.ZoneFinish}
	for i := range s.sections {
		ids = append(ids, ui.ZoneListRow(i))
	}
	id, hit := ui.Hit(click, ids...)
	if hit {
		if id == ui.ZoneBack {
			return s.goBack()
		}
		if id == ui.ZoneFinish {
			return s.emitDone()
		}
		if row, ok := ui.ParseListRow(id); ok {
			cmd := s.selectSection(row)
			s.focus = focusForm
			s.finishFocused = false
			return s, tea.Batch(cmd, s.focusField(0))
		}
	}

	// Prefer exact field zones (marked around each logical field in the form view).
	n := len(s.currentSection().Fields)
	if n > 0 {
		if id, ok := ui.HitPrefix(click, ui.ZoneFormFieldPrefix, n-1); ok {
			if idx, parsed := ui.ParseFormField(id); parsed {
				return s.clickFormField(idx)
			}
		}
	}

	if _, inForm := ui.Hit(click, ui.ZonePaneForm); inForm {
		return s.clickFormField(s.fieldIndexAtClick(click))
	}

	return s, nil
}

func (s Session) clickFormField(idx int) (Session, tea.Cmd) {
	s.focus = focusForm
	s.finishFocused = false
	fields := s.currentSection().Fields
	if idx < 0 || idx >= len(fields) {
		return s, s.focusField(0)
	}
	f := fields[idx]
	switch {
	case f.Kind == KindBool:
		return s, s.toggleBoolAt(idx)
	case fieldEditable(f):
		// Text/secret rows: focus the input so typing works (not just fieldIdx).
		return s, s.focusField(idx)
	case f.canRoll():
		return s, s.toggleRollAt(idx)
	case f.canAutogen():
		return s, s.toggleAutogenAt(idx)
	default:
		return s, s.focusField(idx)
	}
}

// fieldIndexAtClick maps a click using measured content bands when zone marks
// are missing (huh chrome line-count mismatch).
func (s Session) fieldIndexAtClick(click tea.MouseMsg) int {
	n := len(s.currentSection().Fields)
	if n == 0 {
		return 0
	}
	z := zone.Get(ui.ZonePaneForm)
	if z == nil || z.IsZero() {
		return 0
	}
	// Panel chrome: top border + title line before form body.
	const panelChrome = 2
	contentY := max(click.Mouse().Y-z.StartY-panelChrome+s.formVP.YOffset(), 0)
	bands := s.fieldBands()
	if len(bands) == 0 {
		return 0
	}
	for _, b := range bands {
		if contentY >= b.start && contentY < b.end {
			return b.idx
		}
	}
	if contentY >= bands[len(bands)-1].start {
		return n - 1
	}
	return 0
}
