package kit

import (
	"os"
	"path/filepath"
	"testing"
)

func TestHomeUsesExecutableDir(t *testing.T) {
	exe, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	if resolved, err := filepath.EvalSymlinks(exe); err == nil {
		exe = resolved
	}
	want, err := filepath.Abs(filepath.Dir(exe))
	if err != nil {
		t.Fatal(err)
	}
	home, err := Home()
	if err != nil {
		t.Fatal(err)
	}
	if home != want {
		t.Fatalf("Home=%q want exe dir %q", home, want)
	}
}

func TestPathJoinsHome(t *testing.T) {
	home, err := Home()
	if err != nil {
		t.Fatal(err)
	}
	got, err := Path(".env")
	if err != nil {
		t.Fatal(err)
	}
	want := filepath.Join(home, ".env")
	if got != want {
		t.Fatalf("Path=%q want %q", got, want)
	}
}
