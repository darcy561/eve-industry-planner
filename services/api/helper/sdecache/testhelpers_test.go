package sdecache

import (
	"fmt"
	"testing"
	"time"

	"eve-industry-planner/testing/wait"

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
	wait.For(t, timeout, func() (bool, string) {
		cacheMu.RLock()
		got := cacheVer
		cacheMu.RUnlock()
		ready := IsReady()
		return ready && got == want,
			fmt.Sprintf("cache version want %q got %q (ready=%v)", want, got, ready)
	})
}
