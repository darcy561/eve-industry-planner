package kit

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRequireLiveAndDev(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	for _, f := range []string{EnvFile, ConfigFile, AppStackFile, DataStackFile} {
		if err := os.WriteFile(filepath.Join(dir, f), []byte("x\n"), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	if err := Require(dir, false); err != nil {
		t.Fatal(err)
	}
	err := Require(dir, true)
	if err == nil || !strings.Contains(err.Error(), AppStackDevFile) {
		t.Fatalf("want missing dev stack, got %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, AppStackDevFile), []byte("x\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := Require(dir, true); err != nil {
		t.Fatal(err)
	}
}
