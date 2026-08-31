// Package sdecache holds the API process cache of live SDE objects from the object store.
package sdecache

import (
	"context"
	"fmt"
	"sync"
	"sync/atomic"
	"time"

	objectstore "eve-industry-planner/shared/core/objectstore"
	sdecore "eve-industry-planner/shared/core/sde"
	"eve-industry-planner/shared/logs"
	eipnats "eve-industry-planner/shared/nats"
)

var (
	backendOnce sync.Once
	backend     objectstore.Backend
	backendErr  error

	cacheMu    sync.RWMutex
	cacheVer   string
	cacheFiles map[string][]byte
	cacheReady atomic.Bool

	warmerOnce sync.Once

	// Overridable in tests.
	warmerRetryInterval  = 5 * time.Second
	warmerSafetyInterval = 24 * time.Hour
)

// OpenBackend returns the shared object-store backend.
func OpenBackend(ctx context.Context) (objectstore.Backend, error) {
	backendOnce.Do(func() {
		backend, backendErr = objectstore.OpenStaticData(ctx)
	})
	return backend, backendErr
}

// ResetForTest clears the cache singleton (tests only).
func ResetForTest() {
	backendOnce = sync.Once{}
	backend = nil
	backendErr = nil
	warmerOnce = sync.Once{}
	cacheMu.Lock()
	cacheVer = ""
	cacheFiles = nil
	cacheMu.Unlock()
	cacheReady.Store(false)
}

// IsReady reports whether this process has a fully warmed live SDE cache.
func IsReady() bool {
	return cacheReady.Load()
}

// SetReadyForTest overrides the ready flag (tests only).
func SetReadyForTest(ready bool) {
	cacheReady.Store(ready)
}

// StartCacheWarmer loads live SDE into process memory once, then refreshes when the
// worker publishes SubjectCoreSDEBuildUpdated (plus a slow safety recheck).
func StartCacheWarmer(ctx context.Context, natsHandle *eipnats.NATS) {
	warmerOnce.Do(func() {
		rewarm := make(chan struct{}, 1)
		if natsHandle != nil {
			_, err := eipnats.SubscribeSDEBuildUpdated(natsHandle, func(u eipnats.SDECurrentBuildUpdate) {
				signalSDERewarm(ctx, u, rewarm)
			})
			if err != nil {
				logs.WarnCtx(ctx, "failed to subscribe to SDE build updates; cache will rely on safety recheck",
					"error", err)
			}
		} else {
			logs.WarnCtx(ctx, "NATS unavailable for SDE build updates; cache will rely on safety recheck")
		}
		go runCacheWarmer(ctx, rewarm)
	})
}

func signalSDERewarm(ctx context.Context, u eipnats.SDECurrentBuildUpdate, rewarm chan<- struct{}) {
	logs.InfoCtx(ctx, "SDE build update received; refreshing static data cache",
		"build_number", u.BuildNumber, "version", u.Version)
	select {
	case rewarm <- struct{}{}:
	default:
	}
}

func runCacheWarmer(ctx context.Context, rewarm <-chan struct{}) {
	for {
		if ctx.Err() != nil {
			return
		}
		for {
			if ctx.Err() != nil {
				return
			}
			err := tryWarmOnce(ctx)
			if err == nil {
				break
			}
			logs.WarnCtx(ctx, "static data cache warm not ready yet", "error", err)
			select {
			case <-ctx.Done():
				return
			case <-time.After(warmerRetryInterval):
			}
		}

		select {
		case <-ctx.Done():
			return
		case <-rewarm:
		case <-time.After(warmerSafetyInterval):
		}
	}
}

func tryWarmOnce(ctx context.Context) error {
	b, err := OpenBackend(ctx)
	if err != nil {
		return err
	}
	warmCtx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()

	ok, err := sdecore.RequiredLiveReady(warmCtx, b)
	if err != nil {
		return err
	}
	if !ok {
		return fmt.Errorf("live SDE objects not complete in object store")
	}
	return warmLiveCache(warmCtx, b)
}

// ReadLiveFile returns a live SDE file from the process cache.
func ReadLiveFile(ctx context.Context, fileName string) ([]byte, error) {
	cacheMu.RLock()
	if cacheFiles != nil {
		if data, ok := cacheFiles[fileName]; ok {
			out := make([]byte, len(data))
			copy(out, data)
			cacheMu.RUnlock()
			return out, nil
		}
	}
	cacheMu.RUnlock()

	b, err := OpenBackend(ctx)
	if err != nil {
		return nil, err
	}
	data, err := sdecore.GetLiveFile(ctx, b, fileName)
	if err != nil {
		return nil, err
	}

	cacheMu.Lock()
	if cacheFiles == nil {
		cacheFiles = make(map[string][]byte)
	}
	cacheFiles[fileName] = data
	cacheMu.Unlock()
	return data, nil
}

func warmLiveCache(ctx context.Context, b objectstore.Backend) error {
	version, err := sdecore.ReadRootVersionJSON(ctx, b)
	if err != nil {
		return err
	}
	verKey := ""
	if version != nil {
		verKey = version.Version
	}
	names := sdecore.OutputFileNames()

	cacheMu.RLock()
	if cacheAlreadyWarm(verKey, names) {
		cacheMu.RUnlock()
		cacheReady.Store(true)
		return nil
	}
	cacheMu.RUnlock()

	files := make(map[string][]byte, len(names))
	for _, name := range names {
		data, err := sdecore.GetLiveFile(ctx, b, name)
		if err != nil {
			return fmt.Errorf("warm %s: %w", name, err)
		}
		if len(data) == 0 {
			return fmt.Errorf("warm %s: empty object", name)
		}
		files[name] = data
	}

	cacheMu.Lock()
	cacheVer = verKey
	cacheFiles = files
	cacheMu.Unlock()
	cacheReady.Store(true)
	logs.InfoCtx(ctx, "static data cache warmed", "version", verKey, "files", len(files))
	return nil
}

func cacheAlreadyWarm(verKey string, names []string) bool {
	if cacheFiles == nil || cacheVer != verKey {
		return false
	}
	for _, name := range names {
		if _, ok := cacheFiles[name]; !ok {
			return false
		}
	}
	return true
}
