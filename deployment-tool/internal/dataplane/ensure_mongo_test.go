package dataplane_test

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestEnsureMongoIsSoTEntry(t *testing.T) {
	t.Parallel()
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller")
	}
	src, err := os.ReadFile(filepath.Join(filepath.Dir(file), "ensure_mongo.go"))
	if err != nil {
		t.Fatal(err)
	}
	body := string(src)
	if !strings.Contains(body, "func EnsureMongo(") {
		t.Fatal("EnsureMongo missing")
	}
	if !strings.Contains(body, "checkOperatorDocs(") {
		t.Fatal("EnsureMongo must check operator docs first")
	}
	if !strings.Contains(body, "mongo.Ensure(") {
		t.Fatal("EnsureMongo must call mongo.Ensure")
	}
	if strings.Contains(body, "WithTimeout") {
		t.Fatal("EnsureMongo must not impose a short timeout")
	}
}
