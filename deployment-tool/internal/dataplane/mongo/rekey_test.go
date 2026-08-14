package mongo

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func writeMongoEnv(t *testing.T, home string) {
	t.Helper()
	body := strings.Join([]string{
		"MONGO_ROOT_USERNAME=root",
		"MONGO_ROOT_PASSWORD=secret",
		"MONGO_USERNAME=app",
		"MONGO_PASSWORD=appsecret",
		"",
	}, "\n")
	if err := os.WriteFile(filepath.Join(home, ".env"), []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
}

func TestRekeyRefusesWhenTaskRunning(t *testing.T) {
	home := t.TempDir()
	t.Chdir(home)
	writeMongoEnv(t, home)

	prev := taskRunningFn
	taskRunningFn = func(context.Context, string) (bool, error) { return true, nil }
	t.Cleanup(func() { taskRunningFn = prev })

	err := Rekey(context.Background(), "")
	if err == nil || !strings.Contains(err.Error(), "still running") {
		t.Fatalf("got %v", err)
	}
}

func TestRekeyRefusesWhenNoProvisionedVolume(t *testing.T) {
	home := t.TempDir()
	t.Chdir(home)
	writeMongoEnv(t, home)

	prevRun := taskRunningFn
	prevVol := volumeHasDataFn
	taskRunningFn = func(context.Context, string) (bool, error) { return false, nil }
	volumeHasDataFn = func() (bool, string, error) { return false, "", nil }
	t.Cleanup(func() {
		taskRunningFn = prevRun
		volumeHasDataFn = prevVol
	})

	err := Rekey(context.Background(), "")
	if err == nil || !strings.Contains(err.Error(), "no provisioned data volume") {
		t.Fatalf("got %v", err)
	}
	if !strings.Contains(err.Error(), mongoDataVolume) {
		t.Fatalf("want volume name in error, got %v", err)
	}
}

func TestRekeyAuthFailDoesNotWriteKeyfile(t *testing.T) {
	home := t.TempDir()
	t.Chdir(home)
	writeMongoEnv(t, home)

	prevRun := taskRunningFn
	prevVol := volumeHasDataFn
	prevStart := startRekeyMongodFn
	prevStop := stopRekeyMongodFn
	prevWait := waitRekeyRootAuthFn
	taskRunningFn = func(context.Context, string) (bool, error) { return false, nil }
	volumeHasDataFn = func() (bool, string, error) {
		return true, mongoDataVolume, nil
	}
	startRekeyMongodFn = func(_ context.Context, _ string, keyPath string) (string, error) {
		if !keyfilePresent(keyPath) {
			t.Fatal("expected candidate keyfile before start")
		}
		return "cid-rekey", nil
	}
	stopped := false
	stopRekeyMongodFn = func(context.Context, string) error {
		stopped = true
		return nil
	}
	waitRekeyRootAuthFn = func(context.Context, string, creds, time.Duration) error {
		return errors.New("auth failed")
	}
	t.Cleanup(func() {
		taskRunningFn = prevRun
		volumeHasDataFn = prevVol
		startRekeyMongodFn = prevStart
		stopRekeyMongodFn = prevStop
		waitRekeyRootAuthFn = prevWait
	})

	err := Rekey(context.Background(), "")
	if err == nil || !strings.Contains(err.Error(), "auth failed") {
		t.Fatalf("got %v", err)
	}
	if keyfilePresent(filepath.Join(home, keyFileName)) {
		t.Fatal("must not write keyfile after auth failure")
	}
	if keyfilePresent(filepath.Join(home, keyFileName+rekeyTmpSuffix)) {
		t.Fatal("candidate tmp keyfile must be cleaned up")
	}
	if !stopped {
		t.Fatal("expected temp container cleanup")
	}
}

func TestRekeyAuthOKWritesKeyAndBak(t *testing.T) {
	home := t.TempDir()
	t.Chdir(home)
	writeMongoEnv(t, home)

	prevRun := taskRunningFn
	prevVol := volumeHasDataFn
	prevStart := startRekeyMongodFn
	prevStop := stopRekeyMongodFn
	prevWait := waitRekeyRootAuthFn
	taskRunningFn = func(context.Context, string) (bool, error) { return false, nil }
	volumeHasDataFn = func() (bool, string, error) {
		return true, mongoDataVolume, nil
	}
	var seenKey string
	startRekeyMongodFn = func(_ context.Context, vol, keyPath string) (string, error) {
		if vol != mongoDataVolume {
			t.Fatalf("volume %s", vol)
		}
		seenKey = keyPath
		return "cid-rekey", nil
	}
	stopRekeyMongodFn = func(context.Context, string) error { return nil }
	waitRekeyRootAuthFn = func(context.Context, string, creds, time.Duration) error { return nil }
	t.Cleanup(func() {
		taskRunningFn = prevRun
		volumeHasDataFn = prevVol
		startRekeyMongodFn = prevStart
		stopRekeyMongodFn = prevStop
		waitRekeyRootAuthFn = prevWait
	})

	if err := Rekey(context.Background(), ""); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(home, keyFileName)
	bak := filepath.Join(home, keyFileBak)
	if !keyfilePresent(path) || !keyfilePresent(bak) {
		t.Fatal("expected keyfile and bak")
	}
	if seenKey == "" || !strings.HasSuffix(seenKey, rekeyTmpSuffix) {
		t.Fatalf("start key path %q", seenKey)
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if len(raw) < 6 || len(raw) > 1024 {
		t.Fatalf("key length %d", len(raw))
	}
}
