package initui

import (
	"os"
	"path/filepath"
	"testing"

	"eve-industry-planner/deployment-tool/internal/config"
	"eve-industry-planner/deployment-tool/internal/kit"
	"eve-industry-planner/deployment-tool/internal/kit/templates/yamldefaults"
	"eve-industry-planner/deployment-tool/tui/builder"
)

func TestPersistConfigPreservesCLI(t *testing.T) {
	home := t.TempDir()
	t.Chdir(home)

	cfg := yamldefaults.DefaultConfig()
	cfg.CLI.EnvBackupPath = "from-env"
	if err := config.WriteYAML(filepath.Join(home, kit.ConfigFile), cfg); err != nil {
		t.Fatal(err)
	}

	s := NewConfigSession("EDIT CONFIG")
	secs := s.Sections()
	for si := range secs {
		for fi := range secs[si].Fields {
			if secs[si].Fields[fi].ID == "ports.http" {
				secs[si].Fields[fi].Value = "8080"
			}
		}
	}
	s = builder.NewSession("EDIT CONFIG", secs)
	if err := PersistConfig(&s); err != nil {
		t.Fatal(err)
	}
	got, err := config.LoadYAML(filepath.Join(home, kit.ConfigFile))
	if err != nil {
		t.Fatal(err)
	}
	if got.CLI.EnvBackupPath != "from-env" {
		t.Fatalf("cli=%q", got.CLI.EnvBackupPath)
	}
	if got.Ports.HTTP != 8080 {
		t.Fatalf("http=%d", got.Ports.HTTP)
	}
}

func TestWriteConfigDefaultsPreservesCLI(t *testing.T) {
	home := t.TempDir()
	t.Chdir(home)
	cfg := yamldefaults.DefaultConfig()
	cfg.CLI.EnvBackupPath = "kept"
	cfg.Ports.HTTP = 9999
	if err := config.WriteYAML(filepath.Join(home, kit.ConfigFile), cfg); err != nil {
		t.Fatal(err)
	}
	if err := WriteConfigDefaults(); err != nil {
		t.Fatal(err)
	}
	got, err := config.LoadYAML(filepath.Join(home, kit.ConfigFile))
	if err != nil {
		t.Fatal(err)
	}
	if got.CLI.EnvBackupPath != "kept" {
		t.Fatalf("cli=%q", got.CLI.EnvBackupPath)
	}
	if got.Ports.HTTP != 80 {
		t.Fatalf("want default http 80, got %d", got.Ports.HTTP)
	}
	if _, err := os.Stat(filepath.Join(home, kit.ConfigFile)); err != nil {
		t.Fatal(err)
	}
}
