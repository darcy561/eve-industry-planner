package home

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"

	"eve-industry-planner/admintool/tui/ui"
)

func TestToggleMouseCaptureSelectMode(t *testing.T) {
	ui.LockZones()
	defer ui.UnlockZones()

	m := newModel()
	m.ready = true
	m.width, m.height = 100, 40
	if !m.mouseCapture {
		t.Fatal("default mouse on")
	}
	m2, _ := m.toggleMouseCapture()
	mm, ok := m2.(model)
	if !ok || mm.mouseCapture {
		t.Fatal("expected select mode (mouse off)")
	}
	v := mm.View()
	if v.MouseMode != tea.MouseModeNone {
		t.Fatalf("View mouse mode=%v want None", v.MouseMode)
	}
	if !strings.Contains(v.Content, "SELECT TEXT") {
		t.Fatalf("missing select banner in view")
	}
	m3, _ := mm.toggleMouseCapture()
	mm, ok = m3.(model)
	if !ok || !mm.mouseCapture {
		t.Fatal("expected mouse back on")
	}
	if mm.View().MouseMode != tea.MouseModeAllMotion {
		t.Fatalf("View mouse mode=%v want AllMotion", mm.View().MouseMode)
	}
}
