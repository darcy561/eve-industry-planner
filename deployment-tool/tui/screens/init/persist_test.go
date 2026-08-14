package initui

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"eve-industry-planner/deployment-tool/internal/config"
	"eve-industry-planner/deployment-tool/internal/kit"
	"eve-industry-planner/deployment-tool/internal/kit/templates/env"
	"eve-industry-planner/deployment-tool/tui/builder"
)

func TestSectionsFromRegistry(t *testing.T) {
	t.Parallel()
	secs := Sections()
	if len(secs) < 2 {
		t.Fatalf("sections=%d", len(secs))
	}
	var keys int
	var hasBackup bool
	var hasAutogen bool
	for _, sec := range secs {
		if sec.ID == "operator" {
			hasBackup = true
		}
		for _, f := range sec.Fields {
			if f.ID != "" && f.ID != fieldEnvBackupPath {
				keys++
			}
			if f.Autogen {
				hasAutogen = true
			}
		}
	}
	visible := 0
	for _, f := range env.EnvFields() {
		if !f.Hidden {
			visible++
		}
	}
	if keys != visible {
		t.Fatalf("field keys=%d want %d visible EnvFields", keys, visible)
	}
	for _, sec := range secs {
		for _, f := range sec.Fields {
			if f.ID == "REFRESH_TOKEN_AES_KEY_VERSION" {
				t.Fatal("AES key version must stay Hidden (not editable in TUI)")
			}
		}
	}
	if !hasBackup {
		t.Fatal("missing operator section")
	}
	if !hasAutogen {
		t.Fatal("expected Autogen fields from registry")
	}
}

func TestPersistWritesEnvAndConfig(t *testing.T) {
	home := t.TempDir()
	t.Chdir(home)

	s := NewSession()
	// Force autogen on for HMAC so Resolve generates a real key.
	secs := s.Sections()
	for si := range secs {
		for fi := range secs[si].Fields {
			if secs[si].Fields[fi].ID == "AUTHZ_HMAC_KEY" {
				secs[si].Fields[fi].AutogenOn = true
				secs[si].Fields[fi].Value = env.AutoGenerateSentinel
			}
			if secs[si].Fields[fi].ID == fieldEnvBackupPath {
				secs[si].Fields[fi].Value = "test-env-backup"
			}
		}
	}
	// Sections() returns a copy — rebuild session from mutated sections.
	s = builder.NewSession("INIT", secs)

	if err := Persist(&s); err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(filepath.Join(home, kit.EnvFile))
	if err != nil {
		t.Fatal(err)
	}
	body := string(raw)
	if !strings.Contains(body, "APP_VERSION=") {
		t.Fatalf("missing APP_VERSION in:\n%s", body)
	}
	if strings.Contains(body, "AUTHZ_HMAC_KEY="+env.AutoGenerateSentinel) {
		t.Fatal("HMAC still sentinel after Persist")
	}
	cfg, err := config.LoadYAML(filepath.Join(home, kit.ConfigFile))
	if err != nil {
		t.Fatal(err)
	}
	if cfg.CLI.EnvBackupPath != "test-env-backup" {
		t.Fatalf("backup path=%q", cfg.CLI.EnvBackupPath)
	}
}

func TestPersistCreatesEnvBackup(t *testing.T) {
	home := t.TempDir()
	t.Chdir(home)
	envPath := filepath.Join(home, kit.EnvFile)
	initial := env.DefaultEnvValues()
	for _, f := range env.EnvFields() {
		if !f.Autogen {
			continue
		}
		if initial[f.Key] == "" || initial[f.Key] == env.AutoGenerateSentinel {
			v, err := env.Generate(f.Type)
			if err != nil {
				t.Fatal(err)
			}
			initial[f.Key] = v
		}
	}
	if err := env.EmitEnvOpts(envPath, initial, env.EmitOpts{SkipBackup: true}); err != nil {
		t.Fatal(err)
	}

	s := NewSession()
	secs := s.Sections()
	for si := range secs {
		for fi := range secs[si].Fields {
			if secs[si].Fields[fi].ID == fieldEnvBackupPath {
				secs[si].Fields[fi].Value = "smoke-env-backup"
			}
		}
	}
	s = builder.NewSession("EDIT", secs)
	if err := Persist(&s); err != nil {
		t.Fatal(err)
	}
	current := filepath.Join(home, "smoke-env-backup-current.txt")
	if _, err := os.Stat(current); err != nil {
		t.Fatalf("missing backup current: %v", err)
	}
}

func TestPersistPendingRollRegenerates(t *testing.T) {
	home := t.TempDir()
	t.Chdir(home)
	envPath := filepath.Join(home, kit.EnvFile)
	initial := env.DefaultEnvValues()
	oldS3 := "old-s3-secret-value-that-is-long-enough"
	initial["S3_SECRET_KEY"] = oldS3
	// Seed required Autogen material so Persist only needs the roll flag for S3.
	for _, f := range env.EnvFields() {
		if !f.Autogen || f.Key == "S3_SECRET_KEY" {
			continue
		}
		if initial[f.Key] == "" || initial[f.Key] == env.AutoGenerateSentinel {
			v, err := env.Generate(f.Type)
			if err != nil {
				t.Fatal(err)
			}
			initial[f.Key] = v
		}
	}
	if err := env.EmitEnvOpts(envPath, initial, env.EmitOpts{SkipBackup: true}); err != nil {
		t.Fatal(err)
	}

	s := NewSession()
	secs := s.Sections()
	for si := range secs {
		for fi := range secs[si].Fields {
			if secs[si].Fields[fi].ID == "S3_SECRET_KEY" {
				secs[si].Fields[fi].Value = oldS3
				secs[si].Fields[fi].AutogenOn = false
				secs[si].Fields[fi].AllowRoll = true
				secs[si].Fields[fi].Locked = false
				secs[si].Fields[fi].PendingRoll = true
			}
			if secs[si].Fields[fi].ID == fieldEnvBackupPath {
				secs[si].Fields[fi].Value = "test-env-backup"
			}
		}
	}
	s = builder.NewSession("INIT", secs)
	before := oldS3
	if err := Persist(&s); err != nil {
		t.Fatal(err)
	}
	m, err := kit.Map(envPath)
	if err != nil {
		t.Fatal(err)
	}
	got := kit.Get(m, "S3_SECRET_KEY")
	if got == "" || got == before {
		t.Fatalf("S3 secret not rolled: %q", got)
	}
}

func TestPersistAESRollBumpsHiddenVersion(t *testing.T) {
	home := t.TempDir()
	t.Chdir(home)
	envPath := filepath.Join(home, kit.EnvFile)
	initial := env.DefaultEnvValues()
	oldAES, err := env.Generate(env.FieldAES)
	if err != nil {
		t.Fatal(err)
	}
	initial["REFRESH_TOKEN_AES_KEY"] = oldAES
	initial["REFRESH_TOKEN_AES_KEY_VERSION"] = "v1"
	initial["REFRESH_TOKEN_AES_LEGACY_KEYS"] = "{}"
	for _, f := range env.EnvFields() {
		if !f.Autogen || f.Key == "REFRESH_TOKEN_AES_KEY" {
			continue
		}
		if initial[f.Key] == "" || initial[f.Key] == env.AutoGenerateSentinel {
			v, err := env.Generate(f.Type)
			if err != nil {
				t.Fatal(err)
			}
			initial[f.Key] = v
		}
	}
	if err := env.EmitEnvOpts(envPath, initial, env.EmitOpts{SkipBackup: true}); err != nil {
		t.Fatal(err)
	}

	s := NewSession()
	secs := s.Sections()
	for si := range secs {
		for fi := range secs[si].Fields {
			if secs[si].Fields[fi].ID == "REFRESH_TOKEN_AES_KEY" {
				secs[si].Fields[fi].Value = oldAES
				secs[si].Fields[fi].AutogenOn = false
				secs[si].Fields[fi].AllowRoll = true
				secs[si].Fields[fi].PendingRoll = true
			}
			if secs[si].Fields[fi].ID == fieldEnvBackupPath {
				secs[si].Fields[fi].Value = "test-env-backup"
			}
		}
	}
	s = builder.NewSession("INIT", secs)
	if err := Persist(&s); err != nil {
		t.Fatal(err)
	}
	m, err := kit.Map(envPath)
	if err != nil {
		t.Fatal(err)
	}
	if kit.Get(m, "REFRESH_TOKEN_AES_KEY") == oldAES {
		t.Fatal("AES key not rolled")
	}
	if kit.Get(m, "REFRESH_TOKEN_AES_KEY_VERSION") != "v2" {
		t.Fatalf("version=%q want v2", kit.Get(m, "REFRESH_TOKEN_AES_KEY_VERSION"))
	}
	if !strings.Contains(kit.Get(m, "REFRESH_TOKEN_AES_LEGACY_KEYS"), oldAES) {
		t.Fatalf("legacy missing old key: %q", kit.Get(m, "REFRESH_TOKEN_AES_LEGACY_KEYS"))
	}
}

func TestLockedMongoNotOverwritten(t *testing.T) {
	home := t.TempDir()
	t.Chdir(home)
	envPath := filepath.Join(home, kit.EnvFile)
	initial := env.DefaultEnvValues()
	initial["MONGO_PASSWORD"] = "already-set-mongo-password-value-32chars"
	if err := env.EmitEnvOpts(envPath, initial, env.EmitOpts{SkipBackup: true}); err != nil {
		t.Fatal(err)
	}

	s := NewSession()
	secs := s.Sections()
	foundLocked := false
	for _, sec := range secs {
		for _, f := range sec.Fields {
			if f.ID == "MONGO_PASSWORD" {
				foundLocked = f.Locked
				if f.Autogen {
					t.Fatal("locked mongo should not expose Autogen checkbox")
				}
			}
		}
	}
	if !foundLocked {
		t.Fatal("expected MONGO_PASSWORD locked when set")
	}
	s = builder.NewSession("INIT", secs)
	if err := Persist(&s); err != nil {
		t.Fatal(err)
	}
	m, err := kit.Map(envPath)
	if err != nil {
		t.Fatal(err)
	}
	if kit.Get(m, "MONGO_PASSWORD") != "already-set-mongo-password-value-32chars" {
		t.Fatalf("mongo password changed: %q", kit.Get(m, "MONGO_PASSWORD"))
	}
}
