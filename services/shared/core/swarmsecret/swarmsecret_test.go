package swarmsecret

import (
	"os"
	"path/filepath"
	"testing"
)

func TestGet_envWinsOverFile(t *testing.T) {
	dir := t.TempDir()
	prev := secretsDir
	secretsDir = dir
	t.Cleanup(func() { secretsDir = prev })

	name := "TEST_SECRET_KEY"
	t.Setenv(name, "from-env")
	if err := os.WriteFile(filepath.Join(dir, name), []byte("from-file\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if got := Get(name); got != "from-env" {
		t.Fatalf("got %q want from-env", got)
	}
}

func TestGet_fileWhenEnvEmpty(t *testing.T) {
	dir := t.TempDir()
	prev := secretsDir
	secretsDir = dir
	t.Cleanup(func() { secretsDir = prev })

	name := "TEST_SECRET_FILE_ONLY"
	os.Unsetenv(name)
	if err := os.WriteFile(filepath.Join(dir, name), []byte("file-value\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if got := Get(name); got != "file-value" {
		t.Fatalf("got %q", got)
	}
}

func TestGet_whitespaceEnvIgnored(t *testing.T) {
	t.Setenv("TEST_SECRET_WS", "   ")
	if Get("TEST_SECRET_WS") != "" {
		t.Fatal("whitespace-only env should not count")
	}
}

func TestRequire_missing(t *testing.T) {
	dir := t.TempDir()
	prev := secretsDir
	secretsDir = dir
	t.Cleanup(func() { secretsDir = prev })

	os.Unsetenv("TEST_SECRET_MISSING_XYZ")
	if _, err := Require("TEST_SECRET_MISSING_XYZ"); err == nil {
		t.Fatal("expected error")
	}
}

func TestRequire_ok(t *testing.T) {
	t.Setenv("TEST_MESH_HOST", "mongo")
	v, err := Require("TEST_MESH_HOST")
	if err != nil || v != "mongo" {
		t.Fatalf("got %q %v", v, err)
	}
}
