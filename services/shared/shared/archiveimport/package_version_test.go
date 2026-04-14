package archiveimport

import (
	"path/filepath"
	"runtime"
	"testing"
)

func TestVersionFromPackageJSON(t *testing.T) {
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("caller")
	}
	// .../services/shared/shared/archiveimport → repo root
	repoRoot := filepath.Clean(filepath.Join(filepath.Dir(file), "..", "..", "..", ".."))
	p := filepath.Join(repoRoot, "frontend", "package.json")
	v, err := VersionFromPackageJSON(p)
	if err != nil {
		t.Fatal(err)
	}
	if v == "" {
		t.Fatal("empty version")
	}
}

func TestResolveCanonicalBuildVer_prefersEnvOverFile(t *testing.T) {
	t.Setenv("CANONICAL_BUILD_VER", "9.9.9-test")
	v, err := ResolveCanonicalBuildVer("", "")
	if err != nil {
		t.Fatal(err)
	}
	if v != "9.9.9-test" {
		t.Fatalf("got %q", v)
	}
}

func TestResolveCanonicalBuildVer_flagOverridesEnv(t *testing.T) {
	t.Setenv("CANONICAL_BUILD_VER", "1.0.0-env")
	v, err := ResolveCanonicalBuildVer("2.0.0-flag", "")
	if err != nil {
		t.Fatal(err)
	}
	if v != "2.0.0-flag" {
		t.Fatalf("got %q", v)
	}
}

func TestResolveCanonicalBuildVer_fromRepoPackageJSON(t *testing.T) {
	t.Setenv("CANONICAL_BUILD_VER", "")
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("caller")
	}
	repoRoot := filepath.Clean(filepath.Join(filepath.Dir(file), "..", "..", "..", ".."))
	pkg := filepath.Join(repoRoot, "frontend", "package.json")
	v, err := ResolveCanonicalBuildVer("", pkg)
	if err != nil {
		t.Fatal(err)
	}
	if v == "" {
		t.Fatal("empty version")
	}
}

func TestResolveCanonicalBuildVer_prefersWorkerVersionFile(t *testing.T) {
	t.Setenv("CANONICAL_BUILD_VER", "")
	was := DefaultCanonicalBuildVer
	DefaultCanonicalBuildVer = ""
	t.Cleanup(func() { DefaultCanonicalBuildVer = was })

	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("caller")
	}
	servicesDir := filepath.Clean(filepath.Join(filepath.Dir(file), "..", "..", ".."))
	repoRoot := filepath.Clean(filepath.Join(servicesDir, ".."))
	pkg := filepath.Join(repoRoot, "frontend", "package.json")
	t.Chdir(servicesDir)

	// Explicit package.json path; services/worker/VERSION should still win over it.

	want, err := VersionFromTextFile(filepath.Join(servicesDir, "worker", "VERSION"))
	if err != nil {
		t.Fatal(err)
	}
	v, err := ResolveCanonicalBuildVer("", pkg)
	if err != nil {
		t.Fatal(err)
	}
	if v != want {
		t.Fatalf("got %q want %q (worker VERSION should beat package.json)", v, want)
	}
}

func TestResolveCanonicalBuildVer_errorsWhenNothingWorks(t *testing.T) {
	t.Setenv("CANONICAL_BUILD_VER", "")
	was := DefaultCanonicalBuildVer
	DefaultCanonicalBuildVer = ""
	t.Cleanup(func() { DefaultCanonicalBuildVer = was })
	t.Chdir(t.TempDir())
	_, err := ResolveCanonicalBuildVer("", "")
	if err == nil {
		t.Fatal("expected error")
	}
}
