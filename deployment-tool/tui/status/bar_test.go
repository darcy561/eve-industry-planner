package status

import (
	"strings"
	"testing"
)

func TestRenderBarDockerHealth(t *testing.T) {
	snap := Default()
	snap.Docker = LightGreen
	snap.Health = LightAmber
	snap.StatusMsg = "deploying"
	out := RenderBar(80, snap)
	if !strings.Contains(out, "Docker") || !strings.Contains(out, "Health") {
		t.Fatalf("lights: %q", out)
	}
	if strings.Contains(out, "Job") || strings.Contains(out, "Stack") {
		t.Fatalf("retired chips still present: %q", out)
	}
	if !strings.Contains(out, "deploying") {
		t.Fatalf("StatusMsg missing: %q", out)
	}
}
