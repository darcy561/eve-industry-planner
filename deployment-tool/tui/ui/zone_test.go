package ui

import (
	"strings"
	"testing"
	"time"

	tea "charm.land/bubbletea/v2"
)

func TestZoneListRowIDs(t *testing.T) {
	t.Parallel()
	if ZoneListRow(3) != "list.row.3" {
		t.Fatalf("got %q", ZoneListRow(3))
	}
	n, ok := ParseListRow("list.row.12")
	if !ok || n != 12 {
		t.Fatalf("got %d %v", n, ok)
	}
	if _, ok := ParseListRow("pane.form"); ok {
		t.Fatal("non-row id should fail")
	}
}

func TestWheelDirAndLeftClick(t *testing.T) {
	t.Parallel()
	up, ok := WheelDir(tea.MouseWheelMsg{Button: tea.MouseWheelUp})
	if !ok || !up {
		t.Fatal("want wheel up")
	}
	up, ok = WheelDir(tea.MouseWheelMsg{Button: tea.MouseWheelDown})
	if !ok || up {
		t.Fatal("want wheel down")
	}
	if _, ok := WheelDir(tea.KeyPressMsg{}); ok {
		t.Fatal("key is not wheel")
	}
	click, ok := IsLeftClick(tea.MouseReleaseMsg{Button: tea.MouseLeft, X: 1, Y: 2})
	if !ok {
		t.Fatal("want left release")
	}
	if click.Mouse().X != 1 || click.Mouse().Y != 2 {
		t.Fatalf("got %+v", click.Mouse())
	}
	if _, ok := IsLeftClick(tea.MouseReleaseMsg{Button: tea.MouseRight}); ok {
		t.Fatal("right release rejected")
	}
	if _, ok := IsLeftClick(tea.MouseClickMsg{Button: tea.MouseLeft}); ok {
		t.Fatal("press-only must not count (avoids double-fire with release)")
	}
}

func TestMarkScanHit(t *testing.T) {
	LockZones()
	defer UnlockZones()

	frame := Mark(ZoneFinish, "[ Finish ]") + "\n" + Mark(ZoneListRow(1), "Secrets")
	cleaned := Scan(frame)
	if !strings.Contains(cleaned, "[ Finish ]") || !strings.Contains(cleaned, "Secrets") {
		t.Fatalf("scan dropped content: %q", cleaned)
	}
	for _, id := range []string{ZoneFinish, ZoneListRow(1)} {
		if !WaitZoneReady(id, time.Second) {
			t.Fatalf("zone %q not ready", id)
		}
	}

	click, ok := MouseClickAtZone(ZoneFinish)
	if !ok {
		t.Fatal("finish click")
	}
	id, hit := Hit(click, ZoneFinish, ZoneListRow(1))
	if !hit || id != ZoneFinish {
		t.Fatalf("Hit finish: id=%q hit=%v", id, hit)
	}

	rowClick, ok := MouseClickAtZone(ZoneListRow(1))
	if !ok {
		t.Fatal("row click")
	}
	row, hit := HitListRow(rowClick, 3)
	if !hit || row != 1 {
		t.Fatalf("HitListRow: row=%d hit=%v", row, hit)
	}

	miss := tea.MouseReleaseMsg{X: 200, Y: 200, Button: tea.MouseLeft}
	if _, hit := Hit(miss, ZoneFinish); hit {
		t.Fatal("miss should not hit")
	}

	up, ok := MouseWheelAtZone(ZoneFinish, true)
	if !ok || up.Button != tea.MouseWheelUp {
		t.Fatalf("wheel up: %+v ok=%v", up, ok)
	}
	down, ok := MouseWheelAtZone(ZoneFinish, false)
	if !ok || down.Button != tea.MouseWheelDown {
		t.Fatalf("wheel down: %+v ok=%v", down, ok)
	}
}
