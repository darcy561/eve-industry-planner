package deploy

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"eve-industry-planner/deployment-tool/internal/kit"
)

func TestRequireObsStack(t *testing.T) {
	t.Parallel()
	home := t.TempDir()
	if err := requireObsStack(home, false); err != nil {
		t.Fatal(err)
	}
	err := requireObsStack(home, true)
	if err == nil || !strings.Contains(err.Error(), kit.ObsStackFile) {
		t.Fatalf("got %v", err)
	}
	if err := os.WriteFile(filepath.Join(home, kit.ObsStackFile), []byte("services: {}\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := requireObsStack(home, true); err != nil {
		t.Fatal(err)
	}
}

func TestRunRejectsBadSource(t *testing.T) {
	t.Parallel()
	err := Run(context.Background(), SourceMixed)
	if err == nil || !strings.Contains(err.Error(), "live or dev") {
		t.Fatalf("got %v", err)
	}
}

func TestRematerializeRejectsBadSource(t *testing.T) {
	t.Parallel()
	err := Rematerialize(context.Background(), SourceUnknown)
	if err == nil || !strings.Contains(err.Error(), "live or dev") {
		t.Fatalf("got %v", err)
	}
}
