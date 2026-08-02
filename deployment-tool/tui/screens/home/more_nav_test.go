package home

import (
	"testing"
	"time"

	tea "charm.land/bubbletea/v2"

	"eve-industry-planner/deployment-tool/tui/ops"
	"eve-industry-planner/deployment-tool/tui/status"
	"eve-industry-planner/deployment-tool/tui/ui"
)

func TestMoreArrowKeysCanSelectCommand(t *testing.T) {
	m := readyHome(t)
	m.snap.Docker = status.LightGreen
	m.showMoreList()

	n := len(m.list.Items())
	if n < 2 {
		t.Fatalf("More items=%d", n)
	}
	// From Back, ↓ until Command (or exhaust the list).
	found := false
	for i := 0; i < n+2; i++ {
		if e, ok := ops.Selected(m.list); ok && e.Special == ops.SpecialCommand {
			found = true
			break
		}
		next, _ := m.updateMore(tea.KeyPressMsg{Code: tea.KeyDown})
		m = next.(model)
	}
	if !found {
		t.Fatal("↓ through More never selected Command — list highlight/pagination bug")
	}
	next, _ := m.updateMore(tea.KeyPressMsg{Code: tea.KeyEnter})
	hm := next.(model)
	if !hm.cmdSession || hm.focus != focusCommand {
		t.Fatalf("Enter on Command: focus=%v cmdSession=%v", hm.focus, hm.cmdSession)
	}
}

func TestCommandTypedBuilderKeepsFromMore(t *testing.T) {
	m := readyHome(t)
	m.snap.Docker = status.LightGreen
	m.fromMore = true
	_ = m.openCommandSession()
	m.input.SetValue("settings")
	next, _ := m.updateCommand(tea.KeyPressMsg{Code: tea.KeyEnter})
	hm := next.(model)
	if hm.bodyMode != bodyModeBuilder {
		t.Fatalf("mode=%v want builder", hm.bodyMode)
	}
	if !hm.fromMore {
		t.Fatal("More → Command → settings must keep fromMore for return-to-More")
	}
	if hm.cmdSession {
		t.Fatal("cmdSession should clear when builder opens")
	}
}

func TestCommandSetupFailRestoresSession(t *testing.T) {
	home := t.TempDir()
	t.Chdir(home)
	// Force stack fetch to fail quickly (missing stacks + unreachable repo).
	t.Setenv("EIP_UPDATE_REPO", "127.0.0.1:1/nope")
	m := readyHome(t)
	m.fromMore = true
	_ = m.openCommandSession()
	m.input.SetValue("setup")
	next, _ := m.updateCommand(tea.KeyPressMsg{Code: tea.KeyEnter})
	hm := next.(model)
	if hm.bodyMode == bodyModeBuilder {
		// Online fetch may succeed in some environments — still keep fromMore.
		if !hm.fromMore {
			t.Fatal("fromMore should stay true when setup opens from Command")
		}
		return
	}
	if !hm.cmdSession || hm.focus != focusCommand {
		t.Fatalf("want restored Command session: focus=%v cmdSession=%v", hm.focus, hm.cmdSession)
	}
	if !hm.fromMore {
		t.Fatal("fromMore should stay true after failed setup")
	}
}

func TestMoreWheelOnNavMovesSelection(t *testing.T) {
	ui.LockZones()
	defer ui.UnlockZones()

	m := readyHome(t)
	m.snap.Docker = status.LightGreen
	m.showMoreList()
	_ = ui.Scan(ui.JoinPanes(m.renderLeft(), m.renderRight()))
	if !ui.WaitZoneReady(ui.ZonePaneNav, time.Second) {
		t.Fatal("ZonePaneNav")
	}
	before := m.list.Index()
	wheel, ok := ui.MouseWheelAtZone(ui.ZonePaneNav, false)
	if !ok {
		t.Fatal("wheel at nav")
	}
	next, _ := m.handleMouse(wheel)
	hm := next.(model)
	if hm.list.Index() != before+1 {
		t.Fatalf("wheel down on COMMANDS: index=%d want %d", hm.list.Index(), before+1)
	}
}
