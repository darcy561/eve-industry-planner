package builder

import (
	"testing"

	tea "charm.land/bubbletea/v2"
)

func TestNavArrowKeysMoveSelection(t *testing.T) {
	t.Parallel()
	s := NewSession("INIT", stubSections())
	_ = s.SetSize(36, 60, 20)
	s.focus = focusNav
	if s.nav.Index() != 0 {
		t.Fatalf("start idx=%d", s.nav.Index())
	}
	s, _ = s.Update(tea.KeyPressMsg{Code: tea.KeyDown})
	if s.nav.Index() != 1 {
		t.Fatalf("after KeyDown idx=%d want 1 (CursorDown enabled=%v)", s.nav.Index(), s.nav.KeyMap.CursorDown.Enabled())
	}
	s, _ = s.Update(tea.KeyPressMsg{Code: tea.KeyUp})
	if s.nav.Index() != 0 {
		t.Fatalf("after KeyUp idx=%d", s.nav.Index())
	}
}

func TestNavArrowsDoNotJumpToForm(t *testing.T) {
	t.Parallel()
	s := NewSession("INIT", stubSections())
	s = drainCmd(s, s.SetSize(36, 60, 20))
	s.focus = focusNav
	s = applyUpdate(s, tea.KeyPressMsg{Code: tea.KeyDown})
	if s.nav.Index() != 1 {
		t.Fatalf("nav idx=%d", s.nav.Index())
	}
	if s.FocusForm() {
		t.Fatal("↑↓ on section list must not jump into the form pane")
	}
	// At bottom of list, down should stay on nav (not enter form).
	s = applyUpdate(s, tea.KeyPressMsg{Code: tea.KeyDown})
	s = applyUpdate(s, tea.KeyPressMsg{Code: tea.KeyDown})
	if s.FocusForm() {
		t.Fatal("↓ past last section must not jump into the form pane")
	}
}
