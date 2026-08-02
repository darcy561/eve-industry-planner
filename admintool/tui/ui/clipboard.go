package ui

import (
	tea "charm.land/bubbletea/v2"
)

// ClipboardCopiedMsg is emitted after a verified system-clipboard write.
type ClipboardCopiedMsg struct{}

// ClipboardCopyFailedMsg is emitted when no backend could write the clipboard.
type ClipboardCopyFailedMsg struct{ Err error }

func (e ClipboardCopyFailedMsg) Error() string {
	if e.Err == nil {
		return "clipboard copy failed"
	}
	return e.Err.Error()
}

// CopyText writes s to the OS clipboard and verifies the read-back when possible.
// Empty s is a no-op (avoids wiping the clipboard).
//
// On Windows we only use the system clipboard APIs (no OSC52) — batching OSC52
// with clip/Set-Clipboard raced and made copies intermittent under Windows Terminal.
// Non-Windows writes via atotto/clipboard; PasteText still falls back to OSC52 read.
func CopyText(s string) tea.Cmd {
	if s == "" {
		return nil
	}
	return func() tea.Msg {
		if err := writeClipboard(s); err != nil {
			return ClipboardCopyFailedMsg{Err: err}
		}
		return ClipboardCopiedMsg{}
	}
}

// PasteText reads the OS clipboard first; falls back to OSC52 ReadClipboard.
func PasteText() tea.Cmd {
	return func() tea.Msg {
		if s, err := readClipboard(); err == nil && s != "" {
			return tea.ClipboardMsg{Content: s, Selection: 'c'}
		}
		return tea.ReadClipboard()
	}
}
