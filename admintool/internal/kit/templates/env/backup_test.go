package env

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"eve-industry-planner/admintool/internal/config"
	"eve-industry-planner/admintool/internal/kit"
)

func TestBackupEnvRotation(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	envPath := filepath.Join(dir, kit.EnvFile)
	stem := filepath.Join(dir, "eip-env-backup")

	write := func(body string) {
		t.Helper()
		if err := os.WriteFile(envPath, []byte(body), 0o600); err != nil {
			t.Fatal(err)
		}
	}

	clock := time.Date(2026, 7, 28, 10, 0, 0, 0, time.Local)
	now := func() time.Time { return clock }

	write("APP_VERSION=1\n")
	if err := EmitEnvOpts(envPath, map[string]string{"APP_VERSION": "2"}, EmitOpts{BackupStem: stem, Now: now}); err != nil {
		t.Fatal(err)
	}
	cur := currentBackupPath(stem)
	raw, err := os.ReadFile(cur)
	if err != nil {
		t.Fatal(err)
	}
	if string(raw) != "APP_VERSION=1\n" {
		t.Fatalf("current backup=%q", raw)
	}
	live, _ := os.ReadFile(envPath)
	if !strings.Contains(string(live), "APP_VERSION=2") {
		t.Fatalf("live=%s", live)
	}

	// Second save: current → timestamped (stamp = now), live → current
	clock = time.Date(2026, 7, 28, 10, 1, 0, 0, time.Local)
	vals := DefaultEnvValues()
	vals["APP_VERSION"] = "3"
	if err := EmitEnvOpts(envPath, vals, EmitOpts{BackupStem: stem, Now: now}); err != nil {
		t.Fatal(err)
	}
	ts := timestampBackupPath(stem, clock)
	if _, err := os.Stat(ts); err != nil {
		t.Fatalf("expected timestamped backup %s: %v", ts, err)
	}
	raw, err = os.ReadFile(cur)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(raw), "APP_VERSION=2") {
		t.Fatalf("current should be previous live: %s", raw)
	}

	// More saves → prune timestamped to 3
	for i := 0; i < 4; i++ {
		clock = clock.Add(time.Minute)
		vals["APP_VERSION"] = "x"
		if err := EmitEnvOpts(envPath, vals, EmitOpts{BackupStem: stem, Now: now}); err != nil {
			t.Fatal(err)
		}
	}
	re := timestampedBackupRegexp(stem)
	var tsFiles []string
	entries, _ := os.ReadDir(dir)
	for _, e := range entries {
		if re.MatchString(e.Name()) {
			tsFiles = append(tsFiles, e.Name())
		}
	}
	if len(tsFiles) != maxTimestampedEnvBackups {
		t.Fatalf("timestamped count=%d files=%v want %d", len(tsFiles), tsFiles, maxTimestampedEnvBackups)
	}
	if _, err := os.Stat(cur); err != nil {
		t.Fatal("current backup missing")
	}
}

func TestBackupFailClosed(t *testing.T) {
	t.Parallel()
	if runtime.GOOS == "windows" {
		t.Skip("chmod semantics differ on Windows")
	}
	if os.Geteuid() == 0 {
		t.Skip("root bypasses directory write bits")
	}
	dir := t.TempDir()
	envPath := filepath.Join(dir, kit.EnvFile)
	if err := os.WriteFile(envPath, []byte("APP_VERSION=1\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	ro := filepath.Join(dir, "ro")
	if err := os.MkdirAll(ro, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(ro, 0o555); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chmod(ro, 0o755) })
	stem := filepath.Join(ro, "backup")
	before, _ := os.ReadFile(envPath)
	err := EmitEnvOpts(envPath, DefaultEnvValues(), EmitOpts{BackupStem: stem})
	if err == nil {
		t.Fatal("expected preflight error for read-only backup dir")
	}
	if !strings.Contains(err.Error(), "cli.env_backup_path") && !strings.Contains(err.Error(), "not writable") {
		t.Fatalf("want backup-path error, got %v", err)
	}
	after, _ := os.ReadFile(envPath)
	if string(after) != string(before) {
		t.Fatalf("live .env changed despite preflight failure")
	}
}

func TestEmitPreflightReadOnlyEnvDir(t *testing.T) {
	t.Parallel()
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
	envPath := filepath.Join(ro, kit.EnvFile)
	before := []byte("APP_VERSION=keep-me\n")
	if err := os.WriteFile(envPath, before, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(ro, 0o555); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chmod(ro, 0o755) })

	err := EmitEnvOpts(envPath, DefaultEnvValues(), EmitOpts{SkipBackup: true})
	if err == nil {
		t.Fatal("expected cannot write .env")
	}
	if !strings.Contains(err.Error(), "cannot write .env") {
		t.Fatalf("got %v", err)
	}
	after, _ := os.ReadFile(envPath)
	if string(after) != string(before) {
		t.Fatalf("live .env changed: %q", after)
	}
}

func TestCheckBackupStemWritable(t *testing.T) {
	t.Parallel()
	home := t.TempDir()
	if err := CheckBackupStemWritable(home, "ok-stem"); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(home, "ok-stem")); !os.IsNotExist(err) {
		t.Fatal("check must not create stem dirs")
	}
}

func TestWriteMissingSkipsBackup(t *testing.T) {
	t.Parallel()
	home := t.TempDir()
	wrote, err := WriteMissing(home)
	if err != nil || !wrote {
		t.Fatalf("wrote=%v err=%v", wrote, err)
	}
	entries, _ := os.ReadDir(home)
	for _, e := range entries {
		if strings.Contains(e.Name(), "eip-env-backup") {
			t.Fatalf("unexpected backup on first write: %s", e.Name())
		}
	}
}

func TestEffectiveBackupStemResolve(t *testing.T) {
	t.Parallel()
	home := filepath.Join(string(filepath.Separator), "proj")
	if got := ResolveBackupStem(home, ""); got != filepath.Join(home, config.DefaultEnvBackupStem) {
		t.Fatalf("got %q", got)
	}
	if got := ResolveBackupStem(home, "custom"); got != filepath.Join(home, "custom") {
		t.Fatalf("got %q", got)
	}
	abs := filepath.Join(string(filepath.Separator), "abs", "stem")
	if runtime.GOOS == "windows" {
		abs = `C:\abs\stem`
	}
	if got := ResolveBackupStem(home, abs); got != filepath.Clean(abs) {
		t.Fatalf("got %q want %q", got, filepath.Clean(abs))
	}
}
