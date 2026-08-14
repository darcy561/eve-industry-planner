package capsoak

import (
	"testing"
	"time"
)

func TestParseProfile(t *testing.T) {
	p, err := ParseProfile("worker")
	if err != nil || p != ProfileWorker {
		t.Fatalf("worker: %v %q", err, p)
	}
	p, err = ParseProfile("ws")
	if err != nil || p != ProfileWebsocket {
		t.Fatalf("ws: %v %q", err, p)
	}
	p, err = ParseProfile("api")
	if err != nil || p != ProfileAPI {
		t.Fatalf("api: %v %q", err, p)
	}
	if _, err := ParseProfile("nope"); err == nil {
		t.Fatal("expected error")
	}
}

func TestParsePhase(t *testing.T) {
	ph, err := ParsePhase("all")
	if err != nil || ph != PhaseAll {
		t.Fatalf("all: %v %q", err, ph)
	}
	ph, err = ParsePhase("up")
	if err != nil || ph != PhaseUp {
		t.Fatalf("up: %v %q", err, ph)
	}
	ph, err = ParsePhase("scale-down")
	if err != nil || ph != PhaseDown {
		t.Fatalf("down: %v %q", err, ph)
	}
	if _, err := ParsePhase("sideways"); err == nil {
		t.Fatal("expected error")
	}
}

func TestConfigDefaultsPhaseAndRamp(t *testing.T) {
	cfg := (Config{Clients: 80}).withDefaults()
	if cfg.Phase != PhaseAll {
		t.Fatalf("phase=%q", cfg.Phase)
	}
	if cfg.MinLive < 64 {
		t.Fatalf("min-live=%d want ~80%%", cfg.MinLive)
	}
	if cfg.Ramp <= 0 {
		t.Fatalf("ramp should auto for clients>20, got %s", cfg.Ramp)
	}
	cfg2 := (Config{Clients: 10, Ramp: time.Second}).withDefaults()
	if cfg2.Ramp != time.Second {
		t.Fatalf("explicit ramp overridden: %s", cfg2.Ramp)
	}
}

func TestShapeEffectiveReplicas(t *testing.T) {
	if (Shape{Desired: 3, Running: 2}).EffectiveReplicas() != 3 {
		t.Fatal("prefer desired")
	}
	if (Shape{Desired: -1, Running: 2}).EffectiveReplicas() != 2 {
		t.Fatal("fallback running")
	}
}
