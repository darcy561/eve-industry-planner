package home

import (
	"strings"
	"testing"
	"time"

	tea "charm.land/bubbletea/v2"

	"eve-industry-planner/deployment-tool/tui/ops"
	"eve-industry-planner/deployment-tool/tui/status"
	"eve-industry-planner/deployment-tool/tui/ui"
)

func readyHome(t *testing.T) model {
	t.Helper()
	m := newModel()
	m.width, m.height = 120, 40
	m.ready = true
	m.snap.Docker = status.LightGreen
	ops.ApplyMenuGate(&m.list, m.snap.Docker, m.snap.Health)
	_ = m.layout()
	return m
}

func selectSpecial(m *model, special ops.Special) bool {
	for i := 0; i < len(m.list.Items()); i++ {
		m.list.Select(i)
		if e, ok := ops.Selected(m.list); ok && e.Special == special {
			return true
		}
	}
	return false
}

func scanHomeBody(t *testing.T, m model) {
	t.Helper()
	_ = ui.Scan(ui.JoinPanes(m.renderLeft(), m.renderRight()))
	if !ui.WaitZoneReady(ui.ZonePaneNav, time.Second) {
		t.Fatal("nav zone")
	}
	if !ui.WaitZoneReady(ui.ZonePaneOutput, time.Second) {
		t.Fatal("output zone")
	}
	if len(m.list.Items()) == 0 {
		t.Fatal("empty menu")
	}
	if !ui.WaitZoneReady(ui.ZoneListRow(0), time.Second) {
		t.Fatal("list.row.0")
	}
}

func TestActivateMenuMore(t *testing.T) {
	m := readyHome(t)
	if !selectSpecial(&m, ops.SpecialMore) {
		t.Fatal("More not in menu")
	}
	next, _ := m.activateMenu()
	hm := next.(model)
	if hm.focus != focusMore {
		t.Fatalf("focus=%v", hm.focus)
	}
}

func TestActivateMoreOpensSecretsBuilder(t *testing.T) {
	m := readyHome(t)
	m.showMoreList()
	if !selectSpecial(&m, ops.SpecialEditEnv) {
		t.Fatal("Secrets row missing from More")
	}
	next, _ := m.activateMore()
	hm := next.(model)
	if hm.bodyMode != bodyModeBuilder {
		t.Fatalf("bodyMode=%v", hm.bodyMode)
	}
	if hm.builder.Title == "" {
		t.Fatal("builder title empty")
	}
}

func TestActivateMoreOpensCommandSession(t *testing.T) {
	m := readyHome(t)
	m.showMoreList()
	if !selectSpecial(&m, ops.SpecialCommand) {
		t.Fatal("Command row missing from More")
	}
	next, cmd := m.activateMore()
	hm := next.(model)
	if !hm.cmdSession {
		t.Fatal("cmdSession not set")
	}
	if hm.focus != focusCommand {
		t.Fatalf("focus=%v want focusCommand", hm.focus)
	}
	if cmd == nil {
		t.Fatal("want blink cmd")
	}
}

func TestCommandEmptyEnterDoesNotClose(t *testing.T) {
	m := readyHome(t)
	m.showMoreList()
	if !selectSpecial(&m, ops.SpecialCommand) {
		t.Fatal("Command row missing")
	}
	next, _ := m.activateMore()
	hm := next.(model)
	bodyH := hm.bodyH
	next, _ = hm.updateCommand(tea.KeyPressMsg{Code: tea.KeyEnter})
	hm = next.(model)
	if !hm.cmdSession || hm.focus != focusCommand {
		t.Fatalf("empty Enter closed Command: focus=%v cmdSession=%v", hm.focus, hm.cmdSession)
	}
	if hm.bodyH != bodyH {
		t.Fatalf("bodyH changed %d → %d", bodyH, hm.bodyH)
	}
}

func TestCommandOpenDoesNotShrinkBodyChrome(t *testing.T) {
	m := readyHome(t)
	m.showMoreList()
	before := m.bodyH
	beforeVP := m.viewport.Height()
	if !selectSpecial(&m, ops.SpecialCommand) {
		t.Fatal("Command row missing")
	}
	next, _ := m.activateMore()
	hm := next.(model)
	if hm.bodyH != before {
		t.Fatalf("Command open resized body %d → %d", before, hm.bodyH)
	}
	if hm.viewport.Height() >= beforeVP {
		t.Fatalf("Command prompt should shrink OUTPUT viewport: before=%d after=%d", beforeVP, hm.viewport.Height())
	}
}

func TestCommandPromptInsideOutputNotFooter(t *testing.T) {
	ui.LockZones()
	defer ui.UnlockZones()

	m := readyHome(t)
	m.showMoreList()
	if !selectSpecial(&m, ops.SpecialCommand) {
		t.Fatal("Command row missing")
	}
	next, _ := m.activateMore()
	hm := next.(model)
	v := hm.View() // NewProgramView already Scans — do not Scan Content again.
	if !strings.Contains(v.Content, "COMMAND") {
		t.Fatal("want COMMAND panel title")
	}
	// Help footer stays; prompt is not the sole bottom chrome replacing help.
	if !strings.Contains(v.Content, "esc leave") {
		t.Fatalf("want help footer while Command open, view missing esc leave")
	}
	if !ui.WaitZoneReady(ui.ZoneCommandLine, time.Second) {
		t.Fatal("command line zone should be inside OUTPUT panel")
	}
}

func TestCommandMarqueeTickDoesNotUpdateList(t *testing.T) {
	m := readyHome(t)
	m.showMoreList()
	if !selectSpecial(&m, ops.SpecialCommand) {
		t.Fatal("Command row missing")
	}
	next, _ := m.activateMore()
	hm := next.(model)
	idx := hm.list.Index()
	off := hm.delegate.Offset
	next, _ = hm.Update(ui.MarqueeTickMsg{})
	hm = next.(model)
	if hm.list.Index() != idx {
		t.Fatalf("list index moved during Command marquee tick")
	}
	if hm.delegate.Offset != off {
		t.Fatalf("list marquee advanced during Command session: %d → %d", off, hm.delegate.Offset)
	}
}

func TestHandleMouseHoverSelectsRow(t *testing.T) {
	ui.LockZones()
	defer ui.UnlockZones()

	m := readyHome(t)
	scanHomeBody(t, m)
	if len(m.list.Items()) < 2 {
		t.Fatal("need ≥2 rows")
	}
	m.list.Select(0)
	rel, ok := ui.MouseClickAtZone(ui.ZoneListRow(1))
	if !ok {
		t.Fatal("row zone")
	}
	motion := tea.MouseMotionMsg{X: rel.X, Y: rel.Y, Button: tea.MouseLeft}
	next, _ := m.handleMouse(motion)
	hm := next.(model)
	if hm.list.Index() != 1 {
		t.Fatalf("hover selected %d want 1", hm.list.Index())
	}
}

func TestHandleMouseClickOpensCommand(t *testing.T) {
	ui.LockZones()
	defer ui.UnlockZones()

	m := readyHome(t)
	m.showMoreList()
	if !selectSpecial(&m, ops.SpecialCommand) {
		t.Fatal("Command missing from More")
	}
	cmdIdx := m.list.Index()
	scanHomeBody(t, m)
	click, ok := ui.MouseClickAtZone(ui.ZoneListRow(cmdIdx))
	if !ok {
		t.Fatal("Command row zone")
	}
	next, _ := m.handleMouse(click)
	hm := next.(model)
	if !hm.cmdSession || hm.focus != focusCommand {
		t.Fatalf("click Command → focus=%v cmdSession=%v", hm.focus, hm.cmdSession)
	}
	if item, ok := ui.SelectedItem(hm.list); !ok || item.Title() != ops.BackTitle {
		t.Fatal("Command open should show ← Back in left pane (like other More tools)")
	}
}

func TestHandleMouseClickBackLeavesCommand(t *testing.T) {
	ui.LockZones()
	defer ui.UnlockZones()

	m := readyHome(t)
	m.showMoreList()
	if !selectSpecial(&m, ops.SpecialCommand) {
		t.Fatal("Command missing")
	}
	next, _ := m.activateMore()
	hm := next.(model)
	scanHomeBody(t, hm)
	click, ok := ui.MouseClickAtZone(ui.ZoneListRow(0))
	if !ok {
		t.Fatal("Back row zone")
	}
	next, _ = hm.handleMouse(click)
	hm = next.(model)
	if hm.cmdSession || hm.focus == focusCommand {
		t.Fatalf("Back should leave Command: focus=%v cmdSession=%v", hm.focus, hm.cmdSession)
	}
	if hm.focus != focusMore {
		t.Fatalf("focus=%v want focusMore", hm.focus)
	}
}

func TestHandleMouseClickBackFromMore(t *testing.T) {
	ui.LockZones()
	defer ui.UnlockZones()

	m := readyHome(t)
	m.showMoreList()
	if !selectSpecial(&m, ops.SpecialBack) {
		t.Fatal("Back missing from More")
	}
	backIdx := m.list.Index()
	scanHomeBody(t, m)
	click, ok := ui.MouseClickAtZone(ui.ZoneListRow(backIdx))
	if !ok {
		t.Fatal("Back row zone")
	}
	next, _ := m.handleMouse(click)
	hm := next.(model)
	if hm.focus != focusMenu {
		t.Fatalf("Back → focus=%v want menu", hm.focus)
	}
}

func TestHandleMouseClickOpensMore(t *testing.T) {
	ui.LockZones()
	defer ui.UnlockZones()

	m := readyHome(t)
	if !selectSpecial(&m, ops.SpecialMore) {
		t.Fatal("More missing")
	}
	moreIdx := m.list.Index()
	scanHomeBody(t, m)

	click, ok := ui.MouseClickAtZone(ui.ZoneListRow(moreIdx))
	if !ok {
		t.Fatal("More row zone")
	}
	next, _ := m.handleMouse(click)
	hm := next.(model)
	if hm.focus != focusMore {
		t.Fatalf("click More → focus=%v", hm.focus)
	}
}

func TestHandleMouseWheelOutput(t *testing.T) {
	ui.LockZones()
	defer ui.UnlockZones()

	m := readyHome(t)
	for range 40 {
		m.appendOut("line")
	}
	m.pane.Follow = true
	m.syncPane()
	scanHomeBody(t, m)
	rel, ok := ui.MouseClickAtZone(ui.ZonePaneOutput)
	if !ok {
		t.Fatal("output zone")
	}
	wheel := tea.MouseWheelMsg{X: rel.X, Y: rel.Y, Button: tea.MouseWheelUp}
	next, _ := m.handleMouse(wheel)
	hm := next.(model)
	if hm.pane.Follow {
		t.Fatal("wheel up should leave follow")
	}
}
