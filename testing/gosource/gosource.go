// Package gosource walks a Go module's own source files, for tests asserting an
// invariant that must hold everywhere. Reflection reaches only types a test
// names; the ones most likely to carry the mistake are unexported.
package gosource

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// ModuleRoot finds the directory holding go.mod, so a sweep covers the module
// rather than the package the test lives in.
func ModuleRoot(t testing.TB) string {
	t.Helper()
	dir, err := os.Getwd()
	if err != nil {
		t.Fatalf("cwd: %v", err)
	}
	for {
		if _, statErr := os.Stat(filepath.Join(dir, "go.mod")); statErr == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			t.Fatal("no go.mod above the test")
		}
		dir = parent
	}
}

// EachFile calls visit for every .go file under root. Paths are relative and
// slash-separated, so a failure message reads the same on any platform.
func EachFile(t testing.TB, root string, visit func(rel string, body []byte)) {
	t.Helper()
	err := filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil || d.IsDir() || !strings.HasSuffix(path, ".go") {
			return err
		}
		body, readErr := os.ReadFile(path)
		if readErr != nil {
			return readErr
		}
		rel, relErr := filepath.Rel(root, path)
		if relErr != nil {
			return relErr
		}
		visit(filepath.ToSlash(rel), body)
		return nil
	})
	if err != nil {
		t.Fatalf("walk %s: %v", root, err)
	}
}
