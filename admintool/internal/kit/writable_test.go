package kit

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestEnsureDirWritableHappy(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	sub := filepath.Join(dir, "a", "b")
	if err := EnsureDirWritable(sub); err != nil {
		t.Fatal(err)
	}
	if st, err := os.Stat(sub); err != nil || !st.IsDir() {
		t.Fatalf("dir not created: %v", err)
	}
}

func TestCheckDirWritableMissingNoCreate(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	missing := filepath.Join(root, "nope", "deeper")
	if err := CheckDirWritable(missing); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(root, "nope")); !errors.Is(err, fs.ErrNotExist) {
		t.Fatal("CheckDirWritable must not create missing dirs")
	}
}

func TestEnsureFileWritableReadOnlyDir(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("chmod semantics differ on Windows")
	}
	if os.Geteuid() == 0 {
		t.Skip("root bypasses directory write bits")
	}
	root := t.TempDir()
	ro := filepath.Join(root, "ro")
	if err := os.Mkdir(ro, 0o755); err != nil {
		t.Fatal(err)
	}
	envPath := filepath.Join(ro, ".env")
	if err := os.WriteFile(envPath, []byte("APP_VERSION=1\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(ro, 0o555); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chmod(ro, 0o755) })

	err := EnsureFileWritable(envPath)
	if err == nil {
		t.Fatal("expected permission error")
	}
	msg := err.Error()
	if !strings.Contains(msg, "permission") && !strings.Contains(msg, "not writable") {
		t.Fatalf("want permission-flavored error, got %v", err)
	}
}
