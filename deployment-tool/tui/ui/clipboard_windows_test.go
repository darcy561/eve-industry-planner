//go:build windows

package ui

import "testing"

func TestWriteClipboardRoundTripWindows(t *testing.T) {
	want := "eip-clipboard-smoke-" + t.Name()
	if err := writeClipboard(want); err != nil {
		t.Fatal(err)
	}
	got, err := readClipboard()
	if err != nil {
		t.Fatal(err)
	}
	if normalizeClip(got) != normalizeClip(want) {
		t.Fatalf("clipboard=%q want %q", got, want)
	}
}

func TestWriteClipboardRetriesSpecialChars(t *testing.T) {
	want := "abc+/=_-\"'`~\nline2"
	if err := writeClipboard(want); err != nil {
		t.Fatal(err)
	}
	got, err := readClipboard()
	if err != nil {
		t.Fatal(err)
	}
	if normalizeClip(got) != normalizeClip(want) {
		t.Fatalf("clipboard=%q want %q", got, want)
	}
}
