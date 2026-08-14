package templates

import (
	"path/filepath"
	"strings"
	"testing"

	"eve-industry-planner/deployment-tool/internal/kit"
	"eve-industry-planner/deployment-tool/internal/kit/templates/env"
)

func fillEVEOperatorSSO(t *testing.T, home string) {
	t.Helper()
	path := filepath.Join(home, kit.EnvFile)
	m, err := kit.Map(path)
	if err != nil {
		t.Fatal(err)
	}
	m["APP_VERSION"] = "1.0.0"
	m["EVE_CLIENT_ID"] = "test-eve-client-id"
	m["EVE_CLIENT_SECRET"] = "test-eve-client-secret"
	m["EVE_CALLBACK_URL"] = "https://example.com/auth/callback"
	if err := env.EmitEnvOpts(path, m, env.EmitOpts{SkipBackup: true}); err != nil {
		t.Fatal(err)
	}
}

func TestCheckOperatorDocsHappy(t *testing.T) {
	home := t.TempDir()
	if _, err := WriteMissingEnv(home); err != nil {
		t.Fatal(err)
	}
	fillEVEOperatorSSO(t, home)
	if _, err := WriteMissingConfig(home); err != nil {
		t.Fatal(err)
	}
	if err := CheckOperatorDocs(home); err != nil {
		t.Fatal(err)
	}
}

func TestCheckOperatorDocsMissingConfig(t *testing.T) {
	home := t.TempDir()
	if _, err := WriteMissingEnv(home); err != nil {
		t.Fatal(err)
	}
	fillEVEOperatorSSO(t, home)
	err := CheckOperatorDocs(home)
	if err == nil || !strings.Contains(err.Error(), "eip.config.yaml") {
		t.Fatalf("got %v", err)
	}
}

func TestCheckOperatorDocsRejectsBlankEVE(t *testing.T) {
	home := t.TempDir()
	if _, err := WriteMissingEnv(home); err != nil {
		t.Fatal(err)
	}
	if _, err := WriteMissingConfig(home); err != nil {
		t.Fatal(err)
	}
	err := CheckOperatorDocs(home)
	if err == nil || !strings.Contains(err.Error(), "EVE_") {
		t.Fatalf("got %v", err)
	}
}
