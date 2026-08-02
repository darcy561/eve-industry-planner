package status

import (
	"testing"

	"eve-industry-planner/admintool/internal/msg"
)

func TestApplyEventDockerLights(t *testing.T) {
	tests := []struct {
		name      string
		ev        msg.Event
		wantLight Light
		wantSwarm string
	}{
		{
			name:      "active green",
			ev:        msg.DockerEventFromProbe("active", "api 1", false),
			wantLight: LightGreen,
			wantSwarm: "active",
		},
		{
			name:      "inactive amber",
			ev:        msg.DockerEventFromProbe("inactive", "api 1", false),
			wantLight: LightAmber,
			wantSwarm: "inactive",
		},
		{
			name:      "pending amber",
			ev:        msg.DockerEventFromProbe("pending", "", false),
			wantLight: LightAmber,
			wantSwarm: "pending",
		},
		{
			name:      "error amber",
			ev:        msg.DockerEventFromProbe("error", "", false),
			wantLight: LightAmber,
			wantSwarm: "error",
		},
		{
			name:      "engine down red",
			ev:        msg.DockerEventFromProbe("", "", true),
			wantLight: LightRed,
			wantSwarm: "unknown",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			snap := Default()
			changed := ApplyEvent(&snap, tt.ev)
			if !changed {
				t.Fatal("expected docker light change from Default")
			}
			if snap.Docker != tt.wantLight {
				t.Fatalf("Docker=%v want %v", snap.Docker, tt.wantLight)
			}
			if snap.Swarm != tt.wantSwarm {
				t.Fatalf("Swarm=%q want %q", snap.Swarm, tt.wantSwarm)
			}
			if snap.DockerWord != "" {
				t.Fatalf("DockerWord should be empty for lights-only bar, got %q", snap.DockerWord)
			}
		})
	}
}

func TestApplyEventHealth(t *testing.T) {
	snap := Default()
	if !ApplyEvent(&snap, msg.Event{
		Kind: msg.KindHealth, Light: msg.LightGreen, Message: "ok",
	}) {
		t.Fatal("health off→green should report menuChanged")
	}
	if snap.Health != LightGreen || snap.HealthDetail != "ok" {
		t.Fatalf("health=%v detail=%q", snap.Health, snap.HealthDetail)
	}
	if !ApplyEvent(&snap, msg.HealthEventOff("skipped")) {
		t.Fatal("health green→off should report menuChanged")
	}
	if snap.Health != LightOff {
		t.Fatalf("health=%v want off", snap.Health)
	}
	if ApplyEvent(&snap, msg.HealthEventOff("again")) {
		t.Fatal("same health off should not report menuChanged")
	}
}

func TestApplyEventStatusMsg(t *testing.T) {
	snap := Default()
	ApplyEvent(&snap, msg.Event{
		Kind: msg.KindStack, State: "deploying", Light: msg.LightAmber,
		Message: "bringing up stack",
	})
	if snap.StatusMsg != "bringing up stack" {
		t.Fatalf("StatusMsg=%q", snap.StatusMsg)
	}
	ApplyEvent(&snap, msg.Event{
		Kind: msg.KindStack, State: "stopping", Light: msg.LightAmber,
	})
	if snap.StatusMsg != "stopping" {
		t.Fatalf("StatusMsg fallback=%q", snap.StatusMsg)
	}
}

func TestApplyEventDockerChangedFlag(t *testing.T) {
	snap := Default()
	ApplyEvent(&snap, msg.DockerEventFromProbe("active", "", false))
	if ApplyEvent(&snap, msg.DockerEventFromProbe("active", "", false)) {
		t.Fatal("same green should not report dockerChanged")
	}
	if !ApplyEvent(&snap, msg.DockerEventFromProbe("", "", true)) {
		t.Fatal("green→red should report dockerChanged")
	}
}
