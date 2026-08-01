package ops_test

import (
	"testing"

	"eve-industry-planner/admintool/tui/ops"
	"eve-industry-planner/admintool/tui/status"
)

func TestSetupVisibleOnlyWhenNeeded(t *testing.T) {
	home := t.TempDir()
	t.Chdir(home)

	found := false
	for _, e := range ops.VisibleEntries(status.LightOff) {
		if e.Special == ops.SpecialSetup {
			found = true
			if e.Title != "Setup" {
				t.Fatalf("title=%q", e.Title)
			}
		}
	}
	if !found {
		t.Fatal("Setup expected when docs missing")
	}

	writeOperatorKit(t, ".")
	for _, e := range ops.VisibleEntries(status.LightOff) {
		if e.Special == ops.SpecialSetup {
			t.Fatal("Setup must hide when docs + stacks exist")
		}
	}
}

func TestMoreAlwaysOnMain(t *testing.T) {
	t.Parallel()
	for _, light := range []status.Light{status.LightOff, status.LightRed, status.LightAmber, status.LightGreen} {
		found := false
		for _, e := range ops.VisibleEntries(light) {
			if e.Special == ops.SpecialMore {
				found = true
				if e.Title != "More" {
					t.Fatalf("title=%q", e.Title)
				}
			}
		}
		if !found {
			t.Fatalf("More missing for light %v", light)
		}
	}
}
