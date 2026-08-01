package templates

import (
	"os"
	"path/filepath"
	"testing"

	"eve-industry-planner/admintool/internal/kit"
	"eve-industry-planner/admintool/internal/kit/templates/env"
	"eve-industry-planner/admintool/internal/kit/templates/yamldefaults"
)

func TestWriteMissingEnvOnly(t *testing.T) {
	if len(env.EnvFields()) == 0 {
		t.Fatal("empty EnvFields")
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
	if _, err := os.Stat(filepath.Join(home, kit.EnvFile)); err != nil {
		t.Fatal(err)
	}
}

func TestWriteMissingConfigOnly(t *testing.T) {
	home := t.TempDir()
	wrote, err := WriteMissingConfig(home)
	if err != nil || !wrote {
		t.Fatalf("cfg: wrote=%v err=%v", wrote, err)
	}
	wrote, err = WriteMissingConfig(home)
	if err != nil || wrote {
		t.Fatalf("cfg second: wrote=%v err=%v", wrote, err)
	}
	if _, err := os.Stat(filepath.Join(home, kit.ConfigFile)); err != nil {
		t.Fatal(err)
	}
	if err := yamldefaults.DefaultConfig().Validate(); err != nil {
		t.Fatal(err)
	}
}
