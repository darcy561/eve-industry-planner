package sdecache

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	sdecore "eve-industry-planner/shared/core/sde"
	eipnats "eve-industry-planner/shared/nats"
)

func TestTryWarmOnce_setsReadyAndServesFromCache(t *testing.T) {
	b := installTestBackend(t)
	seedLiveSDE(t, b, "10_v1", "warm1")

	if err := tryWarmOnce(context.Background()); err != nil {
		t.Fatalf("warm: %v", err)
	}
	if !IsReady() {
		t.Fatal("expected cache ready")
	}

	data, err := ReadLiveFile(context.Background(), sdecore.RecipeListFile)
	if err != nil {
		t.Fatalf("ReadLiveFile: %v", err)
	}
	if !jsonContainsMarker(data, "warm1") {
		t.Fatalf("unexpected cache body: %s", data)
	}
}

func TestTryWarmOnce_incompleteLiveNotReady(t *testing.T) {
	b := installTestBackend(t)
	ctx := context.Background()
	if err := sdecore.WriteRootVersionJSON(ctx, b, sdecore.VersionJSON{Version: "1_v1", BuildNumber: 1}); err != nil {
		t.Fatal(err)
	}
	if err := b.Put(ctx, sdecore.LiveKey(sdecore.RecipeListFile), []byte(`[]`)); err != nil {
		t.Fatal(err)
	}

	if err := tryWarmOnce(ctx); err == nil {
		t.Fatal("expected warm failure for incomplete live set")
	}
	if IsReady() {
		t.Fatal("IsReady should stay false")
	}
}

// An update signals a rewarm. Undecodable messages never reach here: the shared
// subscribe helper drops them.
func TestSignalSDERewarm_triggersChannel(t *testing.T) {
	rewarm := make(chan struct{}, 1)
	signalSDERewarm(context.Background(), eipnats.SDECurrentBuildUpdate{BuildNumber: 99, Version: "99_v1"}, rewarm)

	select {
	case <-rewarm:
	default:
		t.Fatal("expected rewarm signal")
	}
}

func TestCacheWarmer_rewarmOnSignal(t *testing.T) {
	b := installTestBackend(t)
	seedLiveSDE(t, b, "10_v1", "first")

	restoreRetry := SetWarmerRetryForTest(50 * time.Millisecond)
	restoreSafety := SetWarmerSafetyForTest(time.Hour)
	t.Cleanup(func() {
		restoreRetry()
		restoreSafety()
	})

	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	rewarm := make(chan struct{}, 1)
	go runCacheWarmer(ctx, rewarm)

	waitCacheReady(t, 10*time.Second)
	waitCacheVersion(t, "10_v1", 2*time.Second)

	seedLiveSDE(t, b, "10_v2", "second")
	rewarm <- struct{}{}
	waitCacheVersion(t, "10_v2", 10*time.Second)

	data, err := ReadLiveFile(context.Background(), sdecore.RecipeListFile)
	if err != nil {
		t.Fatal(err)
	}
	if !jsonContainsMarker(data, "second") {
		t.Fatalf("expected refreshed cache, got %s", data)
	}
}

func TestStartCacheWarmer_warmsWithoutNATS(t *testing.T) {
	b := installTestBackend(t)
	seedLiveSDE(t, b, "11_v1", "boot")

	restore := SetWarmerRetryForTest(50 * time.Millisecond)
	t.Cleanup(restore)

	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	StartCacheWarmer(ctx, nil)

	waitCacheReady(t, 10*time.Second)
	if !IsReady() {
		t.Fatal("expected ready after warm")
	}
}

func jsonContainsMarker(data []byte, marker string) bool {
	var m map[string]string
	if err := json.Unmarshal(data, &m); err != nil {
		return false
	}
	return m["marker"] == marker
}
