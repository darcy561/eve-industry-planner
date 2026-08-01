package env

import (
	"path/filepath"
	"strings"
	"testing"

	"eve-industry-planner/admintool/internal/kit"
)

func fillEVEOperatorSSO(t *testing.T, home string) {
	t.Helper()
	path := filepath.Join(home, kit.EnvFile)
	m, err := kit.Map(path)
	if err != nil {
		t.Fatal(err)
	}
	m["EVE_CLIENT_ID"] = "test-eve-client-id"
	m["EVE_CLIENT_SECRET"] = "test-eve-client-secret"
	m["EVE_CALLBACK_URL"] = "https://example.com/auth/callback"
	if err := EmitEnvOpts(path, m, EmitOpts{SkipBackup: true}); err != nil {
		t.Fatal(err)
	}
}

func TestCheckUsableRejectsBlankEVEAfterWriteMissing(t *testing.T) {
	home := t.TempDir()
	if _, err := WriteMissing(home); err != nil {
		t.Fatal(err)
	}
	err := CheckUsable(home)
	if err == nil || !strings.Contains(err.Error(), "EVE_CLIENT_ID") {
		t.Fatalf("want empty EVE SSO failure, got %v", err)
	}
}

func TestCheckUsableAfterWriteMissing(t *testing.T) {
	home := t.TempDir()
	if _, err := WriteMissing(home); err != nil {
		t.Fatal(err)
	}
	fillEVEOperatorSSO(t, home)
	if err := CheckUsable(home); err != nil {
		t.Fatal(err)
	}
}

func TestCheckUsableRejectsLegacyEVEPlaceholders(t *testing.T) {
	home := t.TempDir()
	if _, err := WriteMissing(home); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(home, kit.EnvFile)
	m, err := kit.Map(path)
	if err != nil {
		t.Fatal(err)
	}
	for k, v := range legacyPlaceholders {
		m[k] = v
	}
	if err := EmitEnvOpts(path, m, EmitOpts{SkipBackup: true}); err != nil {
		t.Fatal(err)
	}
	err = CheckUsable(home)
	if err == nil || !strings.Contains(err.Error(), "placeholders") {
		t.Fatalf("got %v", err)
	}
}

func TestCheckUsableRejectsSentinel(t *testing.T) {
	home := t.TempDir()
	if _, err := WriteMissing(home); err != nil {
		t.Fatal(err)
	}
	fillEVEOperatorSSO(t, home)
	path := filepath.Join(home, kit.EnvFile)
	m, err := kit.Map(path)
	if err != nil {
		t.Fatal(err)
	}
	m["S3_SECRET_KEY"] = AutoGenerateSentinel
	if err := EmitEnvOpts(path, m, EmitOpts{SkipBackup: true}); err != nil {
		t.Fatal(err)
	}
	err = CheckUsable(home)
	if err == nil || !strings.Contains(err.Error(), AutoGenerateSentinel) {
		t.Fatalf("got %v", err)
	}
}

func TestCheckUsableRejectsBadLegacyJSON(t *testing.T) {
	home := t.TempDir()
	if _, err := WriteMissing(home); err != nil {
		t.Fatal(err)
	}
	fillEVEOperatorSSO(t, home)
	path := filepath.Join(home, kit.EnvFile)
	m, err := kit.Map(path)
	if err != nil {
		t.Fatal(err)
	}
	m["REFRESH_TOKEN_AES_LEGACY_KEYS"] = "not-json"
	if err := EmitEnvOpts(path, m, EmitOpts{SkipBackup: true}); err != nil {
		t.Fatal(err)
	}
	err = CheckUsable(home)
	if err == nil || !strings.Contains(err.Error(), "LEGACY_KEYS") {
		t.Fatalf("got %v", err)
	}
}

func TestCheckUsableSkipsPasswordStrength(t *testing.T) {
	home := t.TempDir()
	if _, err := WriteMissing(home); err != nil {
		t.Fatal(err)
	}
	fillEVEOperatorSSO(t, home)
	path := filepath.Join(home, kit.EnvFile)
	m, err := kit.Map(path)
	if err != nil {
		t.Fatal(err)
	}
	// Short / charset-invalid vs current Autogen rules — must still pass CheckUsable.
	m["MONGO_PASSWORD"] = "short"
	m["REDIS_PASSWORD"] = "has$dollar"
	if err := EmitEnvOpts(path, m, EmitOpts{SkipBackup: true}); err != nil {
		t.Fatal(err)
	}
	if err := CheckUsable(home); err != nil {
		t.Fatalf("must not validate password strength: %v", err)
	}
	if err := Validate(FieldPassword, m["MONGO_PASSWORD"]); err == nil {
		t.Fatal("fixture should fail Validate — test strength skip is meaningful")
	}
}
