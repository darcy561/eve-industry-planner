package config_test

import (
	"testing"
	"time"

	"eve-industry-planner/capacity-controller/config"
)

func TestLoad_validYAML(t *testing.T) {
	raw := []byte(`
scale_timing:
  cooldown: 2m
  scale_up_stabilization: 1m
  scale_down_stabilization: 5m
services:
  worker:
    capacity_controller_managed: true
    min: 1
    max: 2
    concurrency: 50
  websocket:
    capacity_controller_managed: false
    min: 2
    max: 4
    target_clients: 1500
    reserve_capacity: 0.2
  api:
    capacity_controller_managed: true
    min: 1
    max: 4
`)
	cfg, err := config.Load(raw)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.ScaleTiming.Cooldown.Duration() != 2*time.Minute {
		t.Fatalf("cooldown=%v", cfg.ScaleTiming.Cooldown.Duration())
	}
	if cfg.Services["worker"].Concurrency != 50 {
		t.Fatalf("concurrency=%d", cfg.Services["worker"].Concurrency)
	}
	if cfg.Services["websocket"].ReserveCapacity != 0.2 {
		t.Fatalf("reserve=%v", cfg.Services["websocket"].ReserveCapacity)
	}
}

func TestLoad_missingService(t *testing.T) {
	raw := []byte(`
services:
  worker:
    min: 1
    max: 2
`)
	if _, err := config.Load(raw); err == nil {
		t.Fatal("expected error")
	}
}

func TestLoad_rejectsBadReserve(t *testing.T) {
	raw := []byte(`
services:
  worker:
    capacity_controller_managed: true
    min: 1
    max: 2
    concurrency: 10
  websocket:
    capacity_controller_managed: false
    min: 2
    max: 4
    reserve_capacity: 1.0
  api:
    capacity_controller_managed: false
    min: 1
    max: 2
`)
	if _, err := config.Load(raw); err == nil {
		t.Fatal("expected reserve error")
	}
}

func TestLoad_rejectsMinZero(t *testing.T) {
	raw := []byte(`
services:
  worker:
    capacity_controller_managed: true
    min: 0
    max: 2
    concurrency: 10
  websocket:
    capacity_controller_managed: false
    min: 2
    max: 4
  api:
    capacity_controller_managed: false
    min: 1
    max: 2
`)
	if _, err := config.Load(raw); err == nil {
		t.Fatal("expected min error")
	}
}
