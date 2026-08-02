package builder

import (
	"testing"
	"time"

	"eve-industry-planner/admintool/tui/ui"
)

func TestClickTogglesBool(t *testing.T) {
	t.Parallel()
	secs := []Section{{
		ID: "obs", Title: "Observability",
		Fields: []Field{
			{ID: "obs.enabled", Label: "Enable", Kind: KindBool, Value: "true"},
		},
	}}
	s := NewSession("SETTINGS", secs)
	_ = s.SetSize(40, 70, 20)
	s.focus = focusForm
	cmd := s.toggleBoolAt(0)
	if cmd != nil {
		s = drainCmd(s, cmd)
	}
	if s.sections[0].Fields[0].Value != "false" {
		t.Fatalf("bool click/toggle want false, got %q", s.sections[0].Fields[0].Value)
	}
}

func TestFocusFieldJumpsHuhToTextInput(t *testing.T) {
	t.Parallel()
	secs := []Section{{
		ID: "net", Title: "Network", Help: "hosts",
		Fields: []Field{
			{ID: "a", Label: "Alpha", Kind: KindText, Value: "1"},
			{ID: "b", Label: "Beta", Kind: KindText, Value: "2"},
			{ID: "c", Label: "Gamma", Kind: KindText, Value: "3"},
		},
	}}
	s := NewSession("SETTINGS", secs)
	_ = s.SetSize(40, 70, 28)
	_ = s.focusField(2)
	if got := s.focusedHuhKey(); got != "c" {
		t.Fatalf("focusField(2) want huh key c, got %q (fieldIdx=%d)", got, s.fieldIdx)
	}
	if s.focusedFieldIndex() != 2 {
		t.Fatalf("focusedFieldIndex=%d", s.focusedFieldIndex())
	}
}

func TestClickTextFieldFocusesInput(t *testing.T) {
	ui.LockZones()
	defer ui.UnlockZones()

	secs := []Section{{
		ID: "net", Title: "Network", Help: "hosts",
		Fields: []Field{
			{ID: "a", Label: "Alpha", Kind: KindText, Value: "1"},
			{ID: "b", Label: "Beta", Kind: KindText, Value: "2"},
			{ID: "c", Label: "Gamma", Kind: KindText, Value: "3"},
		},
	}}
	s := NewSession("SETTINGS", secs)
	_ = s.SetSize(40, 70, 28)
	s.focus = focusForm
	_ = s.focusField(0)

	_ = ui.Scan(s.View())
	if !ui.WaitZoneReady(ui.ZoneFormField(2), time.Second) {
		t.Fatal("form.field.2 not registered")
	}
	click, ok := ui.MouseClickAtZone(ui.ZoneFormField(2))
	if !ok {
		t.Fatal("click field 2")
	}
	s2, cmd := s.HandleMouse(click)
	if cmd != nil {
		s2 = drainCmd(s2, cmd)
	}
	if got := s2.focusedHuhKey(); got != "c" {
		t.Fatalf("click text row want focus c, got %q", got)
	}
}
