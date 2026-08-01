package docker

import (
	"testing"

	"github.com/docker/docker/api/types/swarm"
)

func TestRunningImageDigest(t *testing.T) {
	info := ServiceInfo{
		Image: "ghcr.io/x/api:0.8@sha256:specdigest",
		Tasks: []TaskInfo{
			{
				DesiredState: string(swarm.TaskStateShutdown),
				Image:        "ghcr.io/x/api:0.8@sha256:old",
			},
			{
				DesiredState: string(swarm.TaskStateRunning),
				Image:        "ghcr.io/x/api:0.8@sha256:running",
			},
		},
	}
	if got := info.RunningImageDigest(); got != "sha256:running" {
		t.Fatalf("got %q", got)
	}
	empty := ServiceInfo{Image: "ghcr.io/x/api:0.8"}
	if empty.RunningImageDigest() != "" {
		t.Fatal("expected empty without digest")
	}
}
