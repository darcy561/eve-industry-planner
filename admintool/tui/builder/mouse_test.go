package builder

import (
	"testing"
	"time"

	tea "charm.land/bubbletea/v2"

	"eve-industry-planner/admintool/tui/ui"
)

func scanBuilder(t *testing.T, s Session) {
	t.Helper()
	_ = ui.Scan(s.View())
	ids := []string{ui.ZonePaneNav, ui.ZonePaneForm, ui.ZoneBack, ui.ZoneFinish}
	for i := range s.sections {
		ids = append(ids, ui.ZoneListRow(i))
	}
	for _, id := range ids {
		if !ui.WaitZoneReady(id, time.Second) {
			t.Fatalf("zone %q not ready after builder View", id)
		}
	}
}

func TestHandleMouseBackFromForm(t *testing.T) {
	ui.LockZones()
	defer ui.UnlockZones()

	s := NewSession("INIT", stubSections())
	_ = s.SetSize(36, 60, 20)
	s.focus = focusForm
	_ = s.focusField(0)
	scanBuilder(t, s)
	if !ui.WaitZoneReady(ui.ZoneBack, time.Second) {
		t.Fatal("back zone")
	}
	click, ok := ui.MouseClickAtZone(ui.ZoneBack)
	if !ok {
		t.Fatal("back click")
	}
	s, cmd := s.HandleMouse(click)
	if s.FocusForm() {
		t.Fatal("Back from form should return to nav")
	}
	if cmd != nil {
		t.Fatal("should not cancel yet")
	}
}

func TestHandleMouseBackFromNavCancels(t *testing.T) {
	ui.LockZones()
	defer ui.UnlockZones()

	s := NewSession("INIT", stubSections())
	_ = s.SetSize(36, 60, 20)
	s.focus = focusNav
	scanBuilder(t, s)
	click, ok := ui.MouseClickAtZone(ui.ZoneBack)
	if !ok {
		t.Fatal("back click")
	}
	_, cmd := s.HandleMouse(click)
	if cmd == nil {
		t.Fatal("want CancelMsg")
	}
	if _, ok := cmd().(CancelMsg); !ok {
		t.Fatalf("got %T", cmd())
	}
}

func TestHandleMouseFinishClick(t *testing.T) {
	ui.LockZones()
	defer ui.UnlockZones()

	s := NewSession("INIT", stubSections())
	_ = s.SetSize(36, 60, 20)
	s.focus = focusForm
	scanBuilder(t, s)

	click, ok := ui.MouseClickAtZone(ui.ZoneFinish)
	if !ok {
		t.Fatal("finish zone")
	}
	var cmd tea.Cmd
	s, cmd = s.HandleMouse(click)
	if cmd == nil {
		t.Fatal("want DoneMsg")
	}
	if msg := cmd(); msg == nil {
		t.Fatal("nil msg")
	} else if _, ok := msg.(DoneMsg); !ok {
		t.Fatalf("got %T", msg)
	}
}

func TestHandleMouseNavClickEntersForm(t *testing.T) {
	ui.LockZones()
	defer ui.UnlockZones()

	s := NewSession("INIT", stubSections())
	_ = s.SetSize(36, 60, 20)
	s.focus = focusNav
	scanBuilder(t, s)

	click, ok := ui.MouseClickAtZone(ui.ZoneListRow(1))
	if !ok {
		t.Fatal("row 1 zone")
	}
	s, cmd := s.HandleMouse(click)
	if s.ActiveIndex() != 1 {
		t.Fatalf("idx=%d", s.ActiveIndex())
	}
	if !s.FocusForm() {
		t.Fatal("click should enter form")
	}
	if s.finishFocused {
		t.Fatal("should focus fields not Finish")
	}
	_ = cmd
}

func TestHandleMouseWheelOnForm(t *testing.T) {
	ui.LockZones()
	defer ui.UnlockZones()

	fields := make([]Field, 12)
	for i := range fields {
		fields[i] = Field{ID: "f" + string(rune('a'+i)), Label: "Field", Kind: KindText, Value: "v"}
	}
	s := NewSession("INIT", []Section{{ID: "big", Title: "Big", Fields: fields}})
	_ = s.SetSize(36, 40, 12)
	s.focus = focusForm
	_ = s.focusField(0)
	scanBuilder(t, s)

	wheel, ok := ui.MouseWheelAtZone(ui.ZonePaneForm, false)
	if !ok {
		t.Fatal("form wheel")
	}
	s2, _ := s.HandleMouse(wheel)
	if s2.form == nil {
		t.Fatal("form missing after wheel")
	}

	// Wheel outside form / wrong focus is ignored.
	s.focus = focusNav
	s, cmd := s.HandleMouse(wheel)
	if cmd != nil {
		t.Fatal("nav focus should ignore form wheel")
	}
}
