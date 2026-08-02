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

func TestReadyUsesEnsureRegistry(t *testing.T) {
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
		"checkOperatorDocs(",
		"RunAllEnsures(",
	} {
		if !strings.Contains(body, need) {
			t.Fatalf("Ready missing %q", need)
		}
	}
	if strings.Contains(body, "ensureS3(") || strings.Contains(body, "ensureMongo(") {
		t.Fatal("Ready should use RunAllEnsures, not call ensureS3/ensureMongo directly")
	}
	if strings.Contains(body, "mongo.Ensure(") || strings.Contains(body, "s3.Ensure(") {
		t.Fatal("Ready must not call mongo.Ensure/s3.Ensure directly")
	}
}
