package kit

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestHomeFromExecutableUsesDir(t *testing.T) {
	dir := t.TempDir()
	exe := filepath.Join(dir, "eip")
	if runtime.GOOS == "windows" {
		exe += ".exe"
	}
	got, err := homeFromExecutable(exe)
	if err != nil {
		t.Fatal(err)
	}
	want, _ := filepath.Abs(dir)
	if got != want {
		t.Fatalf("Home=%q want %q", got, want)
	}
}

func TestHomeFromExecutableGoBuildFallsBackToWD(t *testing.T) {
	wd := t.TempDir()
	t.Chdir(wd)
	exe := filepath.Join(t.TempDir(), "go-build123", "b001", "eip")
	got, err := homeFromExecutable(exe)
	if err != nil {
		t.Fatal(err)
	}
	want, _ := filepath.Abs(wd)
	if got != want {
		t.Fatalf("Home=%q want wd %q", got, want)
	}
}

func TestHomeFromExecutableTestBinaryFallsBackToWD(t *testing.T) {
	wd := t.TempDir()
	t.Chdir(wd)
	exe := filepath.Join(t.TempDir(), "kit.test")
	if runtime.GOOS == "windows" {
		exe += ".exe"
	}
	got, err := homeFromExecutable(exe)
	if err != nil {
		t.Fatal(err)
	}
	want, _ := filepath.Abs(wd)
	if got != want {
		t.Fatalf("Home=%q want wd %q", got, want)
	}
}

func TestHomeUnderGoTestUsesWD(t *testing.T) {
	// Running via `go test`, the real executable is ephemeral — Home should
	// match cwd so suites that t.Chdir into a temp home keep working.
	wd, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	home, err := Home()
	if err != nil {
		t.Fatal(err)
	}
	want, _ := filepath.Abs(wd)
	if home != want {
		t.Fatalf("Home=%q want %q (go test should use cwd)", home, want)
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

func TestGoToolEphemeralExe(t *testing.T) {
	if !goToolEphemeralExe(`/tmp/go-build123/b001/eip`) {
		t.Fatal("go-build path")
	}
	if !goToolEphemeralExe(`C:\x\go-build99\b\foo.test.exe`) {
		t.Fatal("windows go-build test")
	}
	if goToolEphemeralExe(`/opt/eip/eip`) {
		t.Fatal("install path must not be ephemeral")
	}
}
