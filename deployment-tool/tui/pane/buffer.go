// Package pane is the TUI OUTPUT buffer: append-only text, follow-latest scroll.
//
// Feed from anywhere: EIPMSG pane.* (child), stderr errors, or local tea msgs
// (AppendMsg / ClearMsg) from any screen.
package pane

import (
	"strings"
)

// Buffer holds OUTPUT pane text. Follow pins the viewport to the latest lines.
type Buffer struct {
	Text   string
	Follow bool
}

// Append adds a chunk (multi-line OK). Empty chunk is ignored.
// Always grows history — callers never replace the whole buffer for a new command.
func (b *Buffer) Append(chunk string) {
	if b == nil {
		return
	}
	chunk = strings.TrimRight(chunk, "\r\n")
	if chunk == "" {
		return
	}
	if b.Text != "" {
		b.Text += "\n"
	}
	b.Text += chunk
}

// AppendBlank adds a blank separator line when the buffer is non-empty.
func (b *Buffer) AppendBlank() {
	if b == nil || b.Text == "" {
		return
	}
	b.Text += "\n"
}

// Clear empties the buffer (optional; not used on normal command start).
func (b *Buffer) Clear() {
	if b == nil {
		return
	}
	b.Text = ""
}

// AppendMsg appends to the OUTPUT buffer (any tea.Cmd / Update path).
type AppendMsg struct {
	Text string
}

// ClearMsg clears the OUTPUT buffer.
type ClearMsg struct{}

// ProgressMsg is a replaceable OUTPUT overlay (Done commits Text then clears).
// Fraction is optional overall progress in [0,1] for the terminal ProgressBar.
type ProgressMsg struct {
	Text     string
	Done     bool
	Fraction *float64
}
