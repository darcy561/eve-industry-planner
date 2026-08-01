package dataplane_test

import (
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"eve-industry-planner/admintool/internal/dataplane"
)

func TestErrNotReadyMessage(t *testing.T) {
	t.Parallel()
	err := dataplane.ErrNotReady{Reason: "bucket static-data missing"}
	msg := err.Error()
	if !strings.Contains(msg, "eip init") || !strings.Contains(msg, "ensure-mongo") || !strings.Contains(msg, "ensure-s3") {
		t.Fatalf("%q", msg)
	}
	if !strings.Contains(msg, "bucket static-data missing") {
		t.Fatalf("%q", msg)
	}
	var target dataplane.ErrNotReady
	if !errors.As(err, &target) {
		t.Fatal("errors.As failed")
	}
	if target.Reason == "" {
		t.Fatal("empty reason")
	}
}

func TestReadyRunsEnsureS3AndEnsureMongoConcurrently(t *testing.T) {
	t.Parallel()
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller")
	}
	src, err := os.ReadFile(filepath.Join(filepath.Dir(file), "ready.go"))
	if err != nil {
		t.Fatal(err)
	}
	body := string(src)
	for _, need := range []string{
		"errgroup.WithContext",
		"checkOperatorDocs(",
		"ensureS3(",
		"ensureMongo(",
		"g.Go(",
	} {
		if !strings.Contains(body, need) {
			t.Fatalf("Ready missing %q", need)
		}
	}
	if strings.Contains(body, "mongo.Ensure(") || strings.Contains(body, "s3.Ensure(") {
		t.Fatal("Ready must call ensureS3/ensureMongo only (docs checked once up front)")
	}
	if strings.Contains(body, "s3.Check(") {
		t.Fatal("Ready must use EnsureS3, not check-only")
	}
}
