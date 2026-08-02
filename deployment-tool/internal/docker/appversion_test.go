package docker

import "testing"

func TestDeployedAppVersionPrefersAPIEnv(t *testing.T) {
	s := StackSnapshot{
		Present: true,
		Services: map[string]ServiceInfo{
			"worker": {AppVersion: "0.1.0"},
			"api":    {AppVersion: "0.8.23"},
		},
	}
	if got := s.DeployedAppVersion(); got != "0.8.23" {
		t.Fatalf("got %q", got)
	}
}

func TestDeployedAppVersionImageFallback(t *testing.T) {
	s := StackSnapshot{
		Present: true,
		Services: map[string]ServiceInfo{
			"api": {Image: "ghcr.io/darcy561/eve-industry-planner-api:0.8.20"},
		},
	}
	if got := s.DeployedAppVersion(); got != "0.8.20" {
		t.Fatalf("got %q", got)
	}
}

func TestDeployedAppVersionSkipsBakeTag(t *testing.T) {
	s := StackSnapshot{
		Present: true,
		Services: map[string]ServiceInfo{
			"api": {Image: "eve-industry-planner-api:a1b2c3d4e5f6"},
		},
	}
	if got := s.DeployedAppVersion(); got != "" {
		t.Fatalf("want empty, got %q", got)
	}
}

func TestDeployedAppVersionAbsent(t *testing.T) {
	if got := (StackSnapshot{}).DeployedAppVersion(); got != "" {
		t.Fatalf("want empty, got %q", got)
	}
}
