package ui

import (
	"testing"

	tea "charm.land/bubbletea/v2"
)

func TestPlaceCursor(t *testing.T) {
	t.Parallel()
	if PlaceCursor(nil, 3, 4) != nil {
		t.Fatal("nil base")
	}
	base := tea.NewCursor(2, 1)
	out := PlaceCursor(base, 10, 20)
	if out.X != 12 || out.Y != 21 {
		t.Fatalf("got %+v", out)
	}
	if base.X != 2 || base.Y != 1 {
		t.Fatal("base mutated")
	}
}

func TestNewProgramViewShell(t *testing.T) {
	LockZones()
	defer UnlockZones()

	cur := tea.NewCursor(1, 2)
	bar := ProgressBarFromFraction(nil)
	v := NewProgramView(Mark(ZonePaneOutput, "hello"), ProgramViewOpts{
		Title:       "eip",
		Cursor:      cur,
		ProgressBar: bar,
	})
	if !v.AltScreen {
		t.Fatal("alt screen")
	}
	if v.MouseMode != tea.MouseModeAllMotion {
		t.Fatalf("mouse mode %v", v.MouseMode)
	}
	vNone := NewProgramView("x", ProgramViewOpts{MouseNone: true})
	if vNone.MouseMode != tea.MouseModeNone {
		t.Fatalf("MouseNone mode %v", vNone.MouseMode)
	}
	if v.WindowTitle != "eip" {
		t.Fatalf("title %q", v.WindowTitle)
	}
	if v.Cursor == nil || v.Cursor.X != 1 {
		t.Fatal("cursor not set")
	}
	if v.ProgressBar == nil || v.ProgressBar.State != tea.ProgressBarIndeterminate {
		t.Fatal("progress bar")
	}
}
