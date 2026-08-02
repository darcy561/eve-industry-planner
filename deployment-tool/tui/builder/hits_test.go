package builder

import (
	"strings"
	"testing"
	"time"

	"eve-industry-planner/deployment-tool/tui/ui"
)

func TestMarkFormFieldZonesHitExactField(t *testing.T) {
	ui.LockZones()
	defer ui.UnlockZones()

	secs := []Section{{
		ID: "obs", Title: "Observability", Help: "Stack options",
		Fields: []Field{
			{ID: "a", Label: "Alpha", Kind: KindBool, Value: "false"},
			{ID: "b", Label: "Beta", Kind: KindBool, Value: "true"},
			{ID: "c", Label: "Gamma", Kind: KindText, Value: "x"},
		},
	}}
	s := NewSession("SETTINGS", secs)
	_ = s.SetSize(40, 70, 28)
	s.focus = focusForm
	_ = s.focusField(1) // ensure form settled / focused

	view := s.View()
	_ = ui.Scan(view)
	if !ui.WaitZoneReady(ui.ZoneFormField(1), time.Second) {
		t.Fatal("form.field.1 zone not registered — field marks missing from view")
	}
	click, ok := ui.MouseClickAtZone(ui.ZoneFormField(1))
	if !ok {
		t.Fatal("click at field 1")
	}
	s2, cmd := s.HandleMouse(click)
	_ = cmd
	// Beta was true → click toggles to false
	if s2.sections[0].Fields[1].Value != "false" {
		t.Fatalf("click on field 1 zone should toggle Beta, got %q (view has zones: %v)",
			s2.sections[0].Fields[1].Value, strings.Contains(view, "form.field.1"))
	}
}

func TestFieldBandsCoverAutogenWidgets(t *testing.T) {
	t.Parallel()
	secs := []Section{{
		ID: "sec", Title: "Secrets", Help: "help",
		Fields: []Field{
			{ID: "pw", Label: "Password", Kind: KindSecret, Value: "", Autogen: true, AutogenOn: true},
			{ID: "x", Label: "Other", Kind: KindText, Value: "1"},
		},
	}}
	s := NewSession("SETUP", secs)
	_ = s.SetSize(36, 60, 24)
	bands := s.fieldBands()
	if len(bands) != 2 {
		t.Fatalf("bands=%d", len(bands))
	}
	if bands[0].end <= bands[0].start {
		t.Fatalf("autogen band empty: %+v", bands[0])
	}
	if bands[1].start < bands[0].end {
		t.Fatalf("bands overlap: %+v", bands)
	}
}

func TestMarkFormFieldZonesHitAutogen(t *testing.T) {
	ui.LockZones()
	defer ui.UnlockZones()

	secs := []Section{{
		ID: "sec", Title: "Secrets", Help: "help",
		Fields: []Field{
			{ID: "note", Label: "Note", Kind: KindText, Value: "x"},
			{ID: "pw", Label: "Password", Kind: KindSecret, Value: "", Autogen: true, AutogenOn: true},
		},
	}}
	s := NewSession("SETUP", secs)
	_ = s.SetSize(40, 70, 28)
	s.focus = focusForm
	_ = s.focusField(1)

	view := s.View()
	_ = ui.Scan(view)
	if !ui.WaitZoneReady(ui.ZoneFormField(1), time.Second) {
		t.Fatal("form.field.1 zone not registered")
	}
	click, ok := ui.MouseClickAtZone(ui.ZoneFormField(1))
	if !ok {
		t.Fatal("click at autogen field")
	}
	s2, _ := s.HandleMouse(click)
	if s2.sections[0].Fields[1].AutogenOn {
		t.Fatal("click on Autogen field zone should uncheck AutogenOn")
	}
	if s2.sections[0].Fields[0].Value != "x" {
		t.Fatalf("unrelated field mutated: %q", s2.sections[0].Fields[0].Value)
	}
}
