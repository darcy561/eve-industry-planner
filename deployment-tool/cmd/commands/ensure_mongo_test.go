package commands

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"eve-industry-planner/deployment-tool/internal/catalogue"
)

func TestEnsureMongoCmdNoShortTimeout(t *testing.T) {
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
	if strings.Contains(body, "WithTimeout") {
		t.Fatal("ensure-mongo must not wrap EnsureMongo in WithTimeout")
	}
	if !strings.Contains(body, "dataplane.EnsureMongo(") {
		t.Fatal("ensure-mongo must call dataplane.EnsureMongo")
	}
	if strings.Contains(body, "mongo.Ensure(") {
		t.Fatal("ensure-mongo must not call mongo.Ensure directly")
	}
}

func TestEnsureMongoCatalogMentionsIndexes(t *testing.T) {
	t.Parallel()
	v, ok := catalogue.ByID("ensure-mongo")
	if !ok {
		t.Fatal("ensure-mongo missing from catalogue")
	}
	if !strings.Contains(strings.ToLower(v.Short), "index") {
		t.Fatalf("Short should mention indexes: %q", v.Short)
	}
	c, _, err := rootCmd.Find([]string{"ensure-mongo"})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(strings.ToLower(c.Short), "index") {
		t.Fatalf("cobra Short should mention indexes: %q", c.Short)
	}
	if !strings.Contains(strings.ToLower(c.Long), "index") {
		t.Fatalf("Long should mention indexes: %q", c.Long)
	}
}
