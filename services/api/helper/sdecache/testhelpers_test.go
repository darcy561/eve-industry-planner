package sdecache

import (
	"testing"
	"time"

	objectstore "eve-industry-planner/shared/core/objectstore"
)

func installTestBackend(t *testing.T) objectstore.Backend {
	return InstallTestBackend(t)
}

func seedLiveSDE(t *testing.T, b objectstore.Backend, version, marker string) {
	SeedLiveSDE(t, b, version, marker)
}

func waitCacheReady(t *testing.T, timeout time.Duration) {
	WaitReady(t, timeout)
}

func waitCacheVersion(t *testing.T, want string, timeout time.Duration) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		cacheMu.RLock()
		got := cacheVer
		ready := IsReady()
		cacheMu.RUnlock()
		if ready && got == want {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	cacheMu.RLock()
	got := cacheVer
	cacheMu.RUnlock()
	t.Fatalf("cache version want %q got %q (ready=%v) within %s", want, got, IsReady(), timeout)
}
