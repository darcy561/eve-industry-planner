package capsoak_test

import (
	"testing"

	capsoak "eve-industry-planner/testing/capacity_soak/lib"
)

func TestParseProfile(t *testing.T) {
	p, err := capsoak.ParseProfile("worker")
	if err != nil || p != capsoak.ProfileWorker {
		t.Fatalf("worker: %v %q", err, p)
	}
	p, err = capsoak.ParseProfile("ws")
	if err != nil || p != capsoak.ProfileWebsocket {
		t.Fatalf("ws: %v %q", err, p)
	}
	if _, err := capsoak.ParseProfile("nope"); err == nil {
		t.Fatal("expected error")
	}
}

func TestShapeEffectiveReplicas(t *testing.T) {
	if (capsoak.Shape{Desired: 3, Running: 2}).EffectiveReplicas() != 3 {
		t.Fatal("prefer desired")
	}
	if (capsoak.Shape{Desired: -1, Running: 2}).EffectiveReplicas() != 2 {
		t.Fatal("fallback running")
	}
}
