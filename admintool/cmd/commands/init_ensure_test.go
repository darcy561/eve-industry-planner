package commands

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestInitEnsureUsesDataplaneEnsurePaths(t *testing.T) {
	t.Parallel()
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller")
	}
	src, err := os.ReadFile(filepath.Join(filepath.Dir(file), "init.go"))
	if err != nil {
		t.Fatal(err)
	}
	body := string(src)
	for _, need := range []string{
		"templates.CheckOperatorDocs(",
		"docker.ResolveStackName()",
		"dataplane.EnsureS3(",
		"dataplane.EnsureMongo(",
		"s3.TaskRunning(",
		"mongo.TaskRunning(",
	} {
		if !strings.Contains(body, need) {
			t.Fatalf("init missing %q", need)
		}
	}
	if strings.Contains(body, "mongo.Ensure(") || strings.Contains(body, "s3.Ensure(") {
		t.Fatal("init must call dataplane.Ensure* only")
	}
	// TaskRunning may use a short probe timeout; Ensure must not share a 5m envelope.
	if strings.Contains(body, "WithTimeout(context.Background(), 5*time.Minute)") {
		t.Fatal("init must not wrap Ensure in a 5m timeout")
	}
}
