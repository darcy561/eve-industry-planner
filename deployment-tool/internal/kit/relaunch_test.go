package kit

import (
	"strings"
	"testing"
)

func TestMergeRelaunchEnv(t *testing.T) {
	t.Parallel()
	base := []string{
		"PATH=/bin",
		"EIP_FROM_TUI=1",
		"EIP_UPDATE_RESUME=stale",
		"HOME=/tmp",
	}
	got := mergeRelaunchEnv(base, RelaunchOpts{
		ExtraEnv: []string{"EIP_UPDATE_RESUME=1"},
	})
	joined := strings.Join(got, "\n")
	if strings.Contains(joined, "EIP_FROM_TUI=") {
		t.Fatalf("EIP_FROM_TUI must be stripped: %v", got)
	}
	n := 0
	for _, e := range got {
		if strings.HasPrefix(e, "EIP_UPDATE_RESUME=") {
			n++
			if e != "EIP_UPDATE_RESUME=1" {
				t.Fatalf("resume env=%q", e)
			}
		}
	}
	if n != 1 {
		t.Fatalf("want one EIP_UPDATE_RESUME, got %d in %v", n, got)
	}
}
