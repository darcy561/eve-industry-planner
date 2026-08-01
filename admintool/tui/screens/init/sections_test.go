package initui

import (
	"strings"
	"testing"
)

func TestNewSessionView(t *testing.T) {
	s := NewSession()
	s.SetSize(40, 70, 24)
	view := s.View()
	if view == "" {
		t.Fatal("empty")
	}
	if !strings.Contains(view, "SETUP") {
		t.Fatalf("missing SETUP: %q", view[:min(120, len(view))])
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
