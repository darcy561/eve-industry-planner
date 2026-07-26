package ops_test

import (
	"testing"

	"eve-industry-planner/admintool/internal/catalog"
	"eve-industry-planner/admintool/tui/ops"
	"eve-industry-planner/admintool/tui/status"
)

func TestStatusMenuLinked(t *testing.T) {
	v, ok := catalog.ByID("status")
	if !ok {
		t.Fatal("status missing from catalog")
	}
	found := false
	for _, e := range ops.VisibleEntries(status.LightGreen) {
		if e.Title != v.Title {
			continue
		}
		found = true
		if len(e.Args) != 1 || e.Args[0] != "status" {
			t.Fatalf("args=%v want [status]", e.Args)
		}
		if e.Desc != v.Short {
			t.Fatalf("desc=%q want %q", e.Desc, v.Short)
		}
	}
	if !found {
		t.Fatal("Status not in green menu")
	}
	for _, e := range ops.VisibleEntries(status.LightAmber) {
		if e.Title == "Status" {
			return
		}
	}
	t.Fatal("Status not in amber menu")
}

func TestUpDevInAmberAndGreen(t *testing.T) {
	t.Parallel()
	for _, id := range []string{"up", "dev"} {
		v, ok := catalog.ByID(id)
		if !ok {
			t.Fatalf("%s missing from catalog", id)
		}
		for _, light := range []status.Light{status.LightGreen, status.LightAmber} {
			found := false
			for _, e := range ops.VisibleEntries(light) {
				if e.Title == v.Title && len(e.Args) == 1 && e.Args[0] == id {
					found = true
					break
				}
			}
			if !found {
				t.Fatalf("%s not visible for docker light %v", id, light)
			}
		}
	}
}

func TestApplyDockerGateStartsAtTopAfterProbe(t *testing.T) {
	l, _ := ops.NewMenuList() // LightOff ? Command… only
	if cur, ok := ops.Selected(l); !ok || cur.Title != "Command..." {
		t.Fatalf("initial=%v", cur)
	}
	ops.ApplyDockerGate(&l, status.LightGreen)
	cur, ok := ops.Selected(l)
	if !ok || cur.Title == "Command..." {
		t.Fatalf("after green probe want first verb, got %+v", cur)
	}
	if cur.Title != "Status" {
		// First visible verb after doctor is hidden is Status.
		t.Fatalf("got %q want Status", cur.Title)
	}
}
