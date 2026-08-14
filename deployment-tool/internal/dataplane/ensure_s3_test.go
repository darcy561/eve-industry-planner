package dataplane_test

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestEnsureS3IsSoTEntry(t *testing.T) {
	t.Parallel()
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller")
	}
	src, err := os.ReadFile(filepath.Join(filepath.Dir(file), "ensure_s3.go"))
	if err != nil {
		t.Fatal(err)
	}
	body := string(src)
	if !strings.Contains(body, "func EnsureS3(") {
		t.Fatal("EnsureS3 missing")
	}
	if !strings.Contains(body, "checkOperatorDocs(") {
		t.Fatal("EnsureS3 must check operator docs first")
	}
	if !strings.Contains(body, "s3.Ensure(") {
		t.Fatal("EnsureS3 must call s3.Ensure")
	}
	if strings.Contains(body, "WithTimeout") {
		t.Fatal("EnsureS3 must not impose a short timeout")
	}
}
