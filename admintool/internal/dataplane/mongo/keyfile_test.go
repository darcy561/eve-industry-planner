package mongo

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestEnsureKeyfileWritesOnce(t *testing.T) {
	home := t.TempDir()
	t.Chdir(home)
	prev := volumeHasDataFn
	volumeHasDataFn = func() (bool, string, error) { return false, "", nil }
	t.Cleanup(func() { volumeHasDataFn = prev })

	if err := EnsureKeyfile(); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(home, keyFileName)
	raw1, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if len(raw1) < 6 || len(raw1) > 1024 {
		t.Fatalf("keyfile length %d out of mongo range", len(raw1))
	}
	for _, c := range raw1 {
		if c == '\n' || c == '\r' {
			t.Fatal("keyfile must not contain newlines")
		}
	}
	if !keyfilePresent(filepath.Join(home, keyFileBak)) {
		t.Fatal("expected " + keyFileBak)
	}

	if err := EnsureKeyfile(); err != nil {
		t.Fatal(err)
	}
	raw2, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(raw1) != string(raw2) {
		t.Fatal("second EnsureKeyfile must not rewrite existing keyfile")
	}
}

func TestEnsureKeyfileRestoresFromBak(t *testing.T) {
	home := t.TempDir()
	t.Chdir(home)
	prev := volumeHasDataFn
	volumeHasDataFn = func() (bool, string, error) { return false, "", nil }
	t.Cleanup(func() { volumeHasDataFn = prev })

	if err := EnsureKeyfile(); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(home, keyFileName)
	want, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	if err := EnsureKeyfile(); err != nil {
		t.Fatal(err)
	}
	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != string(want) {
		t.Fatal("restored keyfile does not match bak")
	}
}

func TestEnsureKeyfileRefusesGenerateWhenVolumeHasData(t *testing.T) {
	home := t.TempDir()
	t.Chdir(home)
	prev := volumeHasDataFn
	volumeHasDataFn = func() (bool, string, error) {
		return true, mongoDataVolume, nil
	}
	t.Cleanup(func() { volumeHasDataFn = prev })

	err := EnsureKeyfile()
	if err == nil || !strings.Contains(err.Error(), "already has data") {
		t.Fatalf("got %v", err)
	}
}

func TestRestoreKeyfileFromContainerPrefersTmp(t *testing.T) {
	home := t.TempDir()
	t.Chdir(home)

	prevLookup := lookupMongoContainerFn
	prevProbe := containerPathNonEmptyFn
	prevCopy := copyFromContainerFn
	t.Cleanup(func() {
		lookupMongoContainerFn = prevLookup
		containerPathNonEmptyFn = prevProbe
		copyFromContainerFn = prevCopy
	})

	lookupMongoContainerFn = func(context.Context, string) (string, error) {
		return "abc123container", nil
	}
	var probed []string
	containerPathNonEmptyFn = func(_ context.Context, _ string, path string) (bool, error) {
		probed = append(probed, path)
		return path == "/tmp/mongo-keyfile", nil
	}
	const body = "live-key-from-tmp"
	copyFromContainerFn = func(_ context.Context, _ string, src, dst string) error {
		if src != "/tmp/mongo-keyfile" {
			t.Fatalf("copied %s, want /tmp/mongo-keyfile", src)
		}
		return os.WriteFile(dst, []byte(body), 0o600)
	}

	if err := RestoreKeyfileFromContainer(context.Background(), ""); err != nil {
		t.Fatal(err)
	}
	if len(probed) == 0 || probed[0] != "/tmp/mongo-keyfile" {
		t.Fatalf("probe order %v", probed)
	}
	got, err := os.ReadFile(filepath.Join(home, keyFileName))
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != body {
		t.Fatalf("got %q", got)
	}
	bak, err := os.ReadFile(filepath.Join(home, keyFileBak))
	if err != nil {
		t.Fatal(err)
	}
	if string(bak) != body {
		t.Fatalf("bak %q", bak)
	}
}

func TestRestoreKeyfileFromContainerRequiresRunningTask(t *testing.T) {
	prev := lookupMongoContainerFn
	lookupMongoContainerFn = func(context.Context, string) (string, error) { return "", nil }
	t.Cleanup(func() { lookupMongoContainerFn = prev })

	err := RestoreKeyfileFromContainer(context.Background(), "")
	if err == nil || !strings.Contains(err.Error(), "no running task") {
		t.Fatalf("got %v", err)
	}
}
