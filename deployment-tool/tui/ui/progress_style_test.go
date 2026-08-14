package ui

import (
	"strings"
	"testing"
)

func TestStyleProgressOverlayColorsBars(t *testing.T) {
	t.Parallel()
	in := "Pulling 1 images (2 parallel)\n  redis:8  [██░░]  pulled"
	out := StyleProgressOverlay(in)
	if out == "" || out == in {
		t.Fatal("expected styled output")
	}
	// ANSI present for Primary fill / themed text.
	if !strings.Contains(out, "\x1b[") {
		t.Fatalf("want ANSI in styled board: %q", out)
	}
	if !strings.Contains(out, "Pulling 1 images") {
		t.Fatalf("header lost: %q", out)
	}
}

func TestStyleProgressOverlayEmpty(t *testing.T) {
	t.Parallel()
	if StyleProgressOverlay("") != "" {
		t.Fatal("empty")
	}
}
