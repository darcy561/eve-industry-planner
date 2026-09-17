package mongolive

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// scripts/testing/live-mongo.sh picks the database a local run works in, and
// this package declares the name the guard's message tells you to set. A shell
// script cannot read a Go constant, so the two are pinned here rather than left
// to agree by memory — the same answer collection_names_test.go gives for the
// names shared with the Deployment Tool.
func TestRunnerUsesTheTestDatabase(t *testing.T) {
	t.Parallel()

	path := filepath.Join("..", "..", "scripts", "testing", "live-mongo.sh")
	body, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	if !strings.Contains(string(body), "MONGO_DATABASE:-"+TestDatabase) {
		t.Fatalf("%s does not default MONGO_DATABASE to %q — the runner and this package disagree "+
			"about where a live run writes", path, TestDatabase)
	}
}
