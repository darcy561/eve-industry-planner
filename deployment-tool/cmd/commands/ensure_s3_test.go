package commands

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"eve-industry-planner/deployment-tool/internal/catalogue"
)

func TestEnsureS3CmdCallsDataplane(t *testing.T) {
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
	if !strings.Contains(body, "dataplane.EnsureS3(") {
		t.Fatal("ensure-s3 must call dataplane.EnsureS3")
	}
	if strings.Contains(body, "EnsureMongo(") {
		t.Fatal("ensure-s3 must not call EnsureMongo")
	}
	if strings.Contains(body, "WithTimeout") {
		t.Fatal("ensure-s3 must not wrap EnsureS3 in WithTimeout")
	}
}

func TestEnsureS3Catalog(t *testing.T) {
	t.Parallel()
	v, ok := catalogue.ByID("ensure-s3")
	if !ok {
		t.Fatal("ensure-s3 missing from catalogue")
	}
	if !strings.Contains(strings.ToLower(v.Short), "bucket") && !strings.Contains(strings.ToLower(v.Short), "static-data") {
		t.Fatalf("Short should mention buckets: %q", v.Short)
	}
	c, _, err := rootCmd.Find([]string{"ensure-s3"})
	if err != nil {
		t.Fatal(err)
	}
	if c.Name() != "ensure-s3" {
		t.Fatalf("got %q", c.Name())
	}
}
