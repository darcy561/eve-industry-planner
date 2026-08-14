package sdecache

import (
	"context"
	"testing"
	"time"

	objectstore "eve-industry-planner/shared/core/objectstore"
	sdecore "eve-industry-planner/shared/core/sde"
)

// InstallTestBackend opens the object-store test helper and wires it as the cache backend.
func InstallTestBackend(t *testing.T) objectstore.Backend {
	t.Helper()
	ResetForTest()
	b := objectstore.OpenTestStore(t)
	backendOnce.Do(func() {
		backend = b
		backendErr = nil
	})
	t.Cleanup(ResetForTest)
	return b
}

// SeedLiveSDE writes a complete live SDE set + root version.json for tests.
func SeedLiveSDE(t *testing.T, b objectstore.Backend, version, marker string) {
	t.Helper()
	ctx := context.Background()
	for _, name := range sdecore.OutputFileNames() {
		body := []byte(`{"file":"` + name + `","marker":"` + marker + `"}`)
		if err := b.Put(ctx, sdecore.LiveKey(name), body); err != nil {
			t.Fatalf("put %s: %v", name, err)
		}
	}
	if err := sdecore.WriteRootVersionJSON(ctx, b, sdecore.VersionJSON{
		Version:     version,
		BuildNumber: 1,
		Source:      "test",
	}); err != nil {
		t.Fatalf("write version: %v", err)
	}
}

// WaitReady waits until IsReady is true (tests only).
func WaitReady(t *testing.T, timeout time.Duration) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if IsReady() {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatalf("cache not ready within %s", timeout)
}

// SetWarmerRetryForTest overrides warmer retry interval; returns a restore func.
func SetWarmerRetryForTest(d time.Duration) (restore func()) {
	prev := warmerRetryInterval
	warmerRetryInterval = d
	return func() { warmerRetryInterval = prev }
}

// SetWarmerSafetyForTest overrides warmer safety recheck interval; returns a restore func.
func SetWarmerSafetyForTest(d time.Duration) (restore func()) {
	prev := warmerSafetyInterval
	warmerSafetyInterval = d
	return func() { warmerSafetyInterval = prev }
}
