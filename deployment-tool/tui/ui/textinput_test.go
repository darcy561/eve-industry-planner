package ui

import (
	"testing"

	"charm.land/bubbles/v2/textinput"
	tea "charm.land/bubbletea/v2"
)

func TestApplyTextInputDarkAndPaste(t *testing.T) {
	t.Parallel()
	ApplyTextInputDark(nil) // no panic

	ti := textinput.New()
	ti.Focus()
	ti.SetValue("ab")
	ti.SetCursor(2)
	ApplyTextInputDark(&ti)
	if ti.VirtualCursor() {
		t.Fatal("want real terminal cursor")
	}
	cmd := InsertClipboard(&ti, "XY")
	_ = cmd
	if ti.Value() != "abXY" {
		t.Fatalf("value=%q", ti.Value())
	}
	if InsertClipboard(nil, "x") != nil {
		t.Fatal("nil model")
	}
	if InsertClipboard(&ti, "") != nil {
		t.Fatal("empty paste")
	}
	ti2 := textinput.New()
	ti2.Focus()
	ti2, _ = ti2.Update(tea.PasteMsg{Content: "z"})
	if ti2.Value() != "z" {
		t.Fatalf("paste msg %q", ti2.Value())
	}
}
