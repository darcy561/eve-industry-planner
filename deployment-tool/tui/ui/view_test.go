package ui

import (
	"testing"

	tea "charm.land/bubbletea/v2"
)

func TestProgressBarFromFraction(t *testing.T) {
	t.Parallel()
	bar := ProgressBarFromFraction(nil)
	if bar.State != tea.ProgressBarIndeterminate {
		t.Fatalf("nil → indeterminate, got %v", bar.State)
	}
	f := 0.42
	bar = ProgressBarFromFraction(&f)
	if bar.State != tea.ProgressBarDefault || bar.Value != 42 {
		t.Fatalf("got %+v", bar)
	}
}
