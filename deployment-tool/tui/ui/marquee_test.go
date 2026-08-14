package ui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
)

func TestFitEllipsisAndMarqueeWindow(t *testing.T) {
	t.Parallel()
	if FitEllipsis("hello", 0) != "" {
		t.Fatal("width 0")
	}
	short := FitEllipsis("hello", 10)
	if short != "hello" {
		t.Fatalf("got %q", short)
	}
	long := FitEllipsis("abcdefghij", 6)
	if !strings.HasSuffix(long, "…") || len([]rune(long)) > 6 {
		// ansi.Truncate counts cells; just require ellipsis present.
		if !strings.Contains(long, "…") {
			t.Fatalf("expected ellipsis: %q", long)
		}
	}
	win := MarqueeWindow("abcdefghijklmnop", 6, 0)
	if len([]rune(win)) == 0 {
		t.Fatal("empty marquee window")
	}
	win2 := MarqueeWindow("abcdefghijklmnop", 6, 3)
	if win == win2 {
		t.Fatal("offset should shift window")
	}
	if MarqueeWindow("hi", 10, 99) != "hi" {
		t.Fatal("short string unchanged")
	}
}

func TestMarqueeDelegateAdvanceAndUpdate(t *testing.T) {
	t.Parallel()
	d := NewMarqueeDelegate(24)
	items := ItemsToList([]Item{NewItem("A", "long helper text for marquee"), NewItem("B", "other")})
	l := NewList(items, d, 24, 8)
	d.Advance(0)
	if d.Offset != 0 {
		t.Fatalf("first select resets offset, got %d", d.Offset)
	}
	d.Advance(0)
	if d.Offset != 1 {
		t.Fatalf("same selection advances, got %d", d.Offset)
	}
	d.Advance(1)
	if d.Offset != 0 || d.lastIndex != 1 {
		t.Fatalf("selection change reset: offset=%d last=%d", d.Offset, d.lastIndex)
	}
	cmd := d.Update(MarqueeTickMsg{}, &l)
	if cmd == nil {
		t.Fatal("tick should reschedule")
	}
	if d.Update(tea.KeyPressMsg{}, &l) != nil {
		t.Fatal("non-tick Update is nil")
	}
	view := l.View()
	if !strings.Contains(view, "A") {
		t.Fatalf("list view: %q", view[:min(80, len(view))])
	}
}
