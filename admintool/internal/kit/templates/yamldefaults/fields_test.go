package yamldefaults

import (
	"path/filepath"
	"testing"

	"eve-industry-planner/admintool/internal/config"
	"eve-industry-planner/admintool/internal/kit"
)

func TestValuesFromApplyRoundTrip(t *testing.T) {
	t.Parallel()
	base := DefaultConfig()
	vals := ValuesFromConfig(base)
	vals["addons.observability.enabled"] = "true"
	vals["ports.http"] = "8080"
	vals["proxy.trusted_ips"] = "127.0.0.1, 10.0.0.1"
	vals["services.worker.max"] = "3"
	got, err := ApplyToConfig(base, vals)
	if err != nil {
		t.Fatal(err)
	}
	if !got.Addons.Observability.Enabled {
		t.Fatal("observability not enabled")
	}
	if got.Ports.HTTP != 8080 {
		t.Fatalf("http=%d", got.Ports.HTTP)
	}
	if len(got.Proxy.TrustedIPs) != 2 {
		t.Fatalf("ips=%v", got.Proxy.TrustedIPs)
	}
	if got.Services["worker"].Max != 3 {
		t.Fatalf("worker.max=%d", got.Services["worker"].Max)
	}
	// CLI preserved from base
	if got.CLI.EnvBackupPath != base.CLI.EnvBackupPath {
		t.Fatalf("cli backup path changed: %q", got.CLI.EnvBackupPath)
	}
}

func TestApplyToConfigPreservesCLIWhenOmitted(t *testing.T) {
	t.Parallel()
	base := DefaultConfig()
	base.CLI.EnvBackupPath = "my-backups"
	got, err := ApplyToConfig(base, ValuesFromConfig(base))
	if err != nil {
		t.Fatal(err)
	}
	if got.CLI.EnvBackupPath != "my-backups" {
		t.Fatalf("got %q", got.CLI.EnvBackupPath)
	}
}

func TestWriteDefaultsPreservingCLI(t *testing.T) {
	home := t.TempDir()
	path := filepath.Join(home, kit.ConfigFile)
	if err := WriteDefaultsPreservingCLI(path, config.CLI{EnvBackupPath: "from-env-step"}); err != nil {
		t.Fatal(err)
	}
	cfg, err := config.LoadYAML(path)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.CLI.EnvBackupPath != "from-env-step" {
		t.Fatalf("backup=%q", cfg.CLI.EnvBackupPath)
	}
	if cfg.Ports.HTTP != 80 {
		t.Fatalf("expected default ports, http=%d", cfg.Ports.HTTP)
	}
}

func TestApplyRejectsBadValidate(t *testing.T) {
	t.Parallel()
	base := DefaultConfig()
	vals := ValuesFromConfig(base)
	vals["services.worker.min"] = "5"
	vals["services.worker.max"] = "2"
	_, err := ApplyToConfig(base, vals)
	if err == nil {
		t.Fatal("want validate error")
	}
}
