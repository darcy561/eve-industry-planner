package kit

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestInstallAndRemovePathLink(t *testing.T) {
	dir := t.TempDir()
	// Symlink to the test binary itself (always exists).
	linkPath, err := InstallPathLink(dir)
	if err != nil {
		if runtime.GOOS == "windows" {
			t.Skipf("symlink not available: %v", err)
		}
		t.Fatal(err)
	}
	wantName := LinkName()
	if filepath.Base(linkPath) != wantName {
		t.Fatalf("link basename=%q want %q", filepath.Base(linkPath), wantName)
	}
	fi, err := os.Lstat(linkPath)
	if err != nil {
		t.Fatal(err)
	}
	if fi.Mode()&os.ModeSymlink == 0 {
		t.Fatalf("%s is not a symlink", linkPath)
	}
	// Idempotent
	if _, err := InstallPathLink(dir); err != nil {
		t.Fatal(err)
	}
	removed, err := RemovePathLink(dir)
	if err != nil {
		t.Fatal(err)
	}
	if removed != linkPath {
		t.Fatalf("removed=%q want %q", removed, linkPath)
	}
	if _, err := os.Lstat(linkPath); !errors.Is(err, fs.ErrNotExist) {
		t.Fatalf("link still present: %v", err)
	}
}

func TestDirOnPATH(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("PATH", dir+string(os.PathListSeparator)+os.Getenv("PATH"))
	if !DirOnPATH(dir) {
		t.Fatal("expected dir on PATH")
	}
	if DirOnPATH(filepath.Join(dir, "nope-subdir-not-on-path")) {
		t.Fatal("subdir should not match PATH element")
	}
}
