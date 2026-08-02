package ui

import (
	"testing"
	"time"
)

func TestListRenderMarksRowZones(t *testing.T) {
	LockZones()
	defer UnlockZones()

	items := []Item{NewItem("Setup", "Get started"), NewItem("More", "tools")}
	l, _ := NewItemList(items, 28, 10)
	_ = Scan(Mark(ZonePaneNav, l.View()))
	for _, id := range []string{ZonePaneNav, ZoneListRow(0), ZoneListRow(1)} {
		if !WaitZoneReady(id, time.Second) {
			t.Fatalf("zone %q not ready", id)
		}
	}
	click, ok := MouseClickAtZone(ZoneListRow(1))
	if !ok {
		t.Fatal("row1 click")
	}
	row, hit := HitListRow(click, 1)
	if !hit || row != 1 {
		t.Fatalf("row=%d hit=%v", row, hit)
	}
	sel, ok := SelectedItem(l)
	if !ok || sel.Title() != "Setup" {
		t.Fatalf("default selection: %+v ok=%v", sel, ok)
	}
	l.Select(1)
	sel, ok = SelectedItem(l)
	if !ok || sel.Title() != "More" {
		t.Fatalf("selected More: %+v", sel)
	}
}
