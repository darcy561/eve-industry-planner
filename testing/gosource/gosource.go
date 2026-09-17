// Package gosource walks a Go module's own source files.
//
// It exists for tests asserting a tag or naming invariant that must hold
// everywhere. Reflection can only reach types a test remembers to name, and the
// types most likely to carry the mistake are unexported ones in packages the
// test does not import — so those sweeps read the source instead.
package gosource

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// ModuleRoot walks up from the working directory to the directory holding
// go.mod, so a sweep covers the whole module rather than the package the test
// happens to live in.
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

// EachFile calls visit for every .go file under root, with the path relative to
// root and slash-separated so a failure message reads the same on any platform.
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
