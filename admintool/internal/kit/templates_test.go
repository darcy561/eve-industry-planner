package kit

import (
	"os"
	"path/filepath"
	"testing"
)

func TestWriteMissing(t *testing.T) {
	if len(envExample) == 0 || len(configExample) == 0 {
		t.Fatal("empty embed")
	}
	home := t.TempDir()
	wrote, err := WriteMissingEnv(home)
	if err != nil || !wrote {
		t.Fatalf("env: wrote=%v err=%v", wrote, err)
	}
	wrote, err = WriteMissingEnv(home)
	if err != nil || wrote {
		t.Fatalf("env second: wrote=%v err=%v", wrote, err)
	}
	wrote, err = WriteMissingConfig(home)
	if err != nil || !wrote {
		t.Fatalf("cfg: wrote=%v err=%v", wrote, err)
	}
	if _, err := os.Stat(filepath.Join(home, EnvFile)); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(home, ConfigFile)); err != nil {
		t.Fatal(err)
	}
}
