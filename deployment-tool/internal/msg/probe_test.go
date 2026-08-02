package msg

import "testing"

func TestDockerEventFromProbe(t *testing.T) {
	tests := []struct {
		name        string
		swarm       string
		unreachable bool
		wantState   string
		wantLight   string
	}{
		{"engine down", "", true, "down", LightRed},
		{"swarm active", "active", false, "active", LightGreen},
		{"swarm inactive", "inactive", false, "inactive", LightAmber},
		{"swarm pending", "pending", false, "pending", LightAmber},
		{"swarm error", "error", false, "error", LightAmber},
		{"swarm locked", "locked", false, "locked", LightAmber},
		{"swarm unknown", "weird", false, "weird", LightAmber},
		{"swarm empty", "", false, "unknown", LightAmber},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ev := DockerEventFromProbe(tt.swarm, "detail", tt.unreachable)
			if ev.Kind != KindDocker {
				t.Fatalf("kind=%q", ev.Kind)
			}
			if ev.State != tt.wantState {
				t.Fatalf("state=%q want %q", ev.State, tt.wantState)
			}
			if ev.Light != tt.wantLight {
				t.Fatalf("light=%q want %q", ev.Light, tt.wantLight)
			}
			if tt.unreachable && ev.Message != "unreachable" {
				t.Fatalf("message=%q", ev.Message)
			}
			if !tt.unreachable && ev.Message != "detail" {
				t.Fatalf("message=%q", ev.Message)
			}
		})
	}
}

func TestHealthEventFromProbe(t *testing.T) {
	ev := HealthEventFromProbe(LightGreen, "3 services")
	if ev.Kind != KindHealth || ev.Light != LightGreen || ev.Message != "3 services" {
		t.Fatalf("%+v", ev)
	}
	off := HealthEventOff("engine down")
	if off.Kind != KindHealth || off.Light != LightOff {
		t.Fatalf("%+v", off)
	}
}
