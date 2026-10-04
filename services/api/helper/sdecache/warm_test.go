package sdecache

import (
	"context"
	"testing"

	objectstore "eve-industry-planner/shared/core/objectstore"
	sdecore "eve-industry-planner/shared/core/sde"
)

func publishedBuild(t *testing.T, without ...string) *objectstore.MemoryBackend {
	t.Helper()
	ResetForTest()
	t.Cleanup(ResetForTest)

	skip := make(map[string]bool, len(without))
	for _, name := range without {
		skip[name] = true
	}

	b := objectstore.NewMemoryBackend()
	ctx := context.Background()
	for _, name := range sdecore.OutputFileNames() {
		if skip[name] {
			continue
		}
		if err := b.Put(ctx, sdecore.LiveKey(name), []byte(`{"file":"`+name+`"}`)); err != nil {
			t.Fatalf("put %s: %v", name, err)
		}
	}
	if err := sdecore.WriteRootVersionJSON(ctx, b, sdecore.VersionJSON{
		Version: "v1", BuildNumber: 1, Source: "test",
	}); err != nil {
		t.Fatalf("write version: %v", err)
	}
	return b
}

func TestAWholeBuildWarmsAndIsReady(t *testing.T) {
	b := publishedBuild(t)

	if err := warmLiveCache(context.Background(), b); err != nil {
		t.Fatalf("warm: %v", err)
	}
	if !IsReady() {
		t.Error("a complete build left the cache not ready")
	}
	if got := len(cacheFiles); got != len(sdecore.OutputFileNames()) {
		t.Errorf("held %d files, want %d", got, len(sdecore.OutputFileNames()))
	}
}

func TestABuildWithoutAFileTheCodeKnowsAboutStillServes(t *testing.T) {
	b := publishedBuild(t, sdecore.IndustryBonusesFile)

	if err := warmLiveCache(context.Background(), b); err != nil {
		t.Fatalf("warm: %v", err)
	}
	if !IsReady() {
		t.Fatal("a build published before a file was added took the API out of rotation")
	}
	if _, held := cacheFiles[sdecore.IndustryBonusesFile]; held {
		t.Error("a file the build does not carry was warmed anyway")
	}
	if _, held := cacheFiles[sdecore.RecipeListFile]; !held {
		t.Error("the files the build does carry were not warmed")
	}
}

func TestAnEmptyObjectIsTreatedAsNotPublished(t *testing.T) {
	b := publishedBuild(t, sdecore.IndustryBonusesFile)
	if err := b.Put(context.Background(), sdecore.LiveKey(sdecore.IndustryBonusesFile), []byte{}); err != nil {
		t.Fatalf("put empty: %v", err)
	}

	if err := warmLiveCache(context.Background(), b); err != nil {
		t.Fatalf("warm: %v", err)
	}
	if !IsReady() {
		t.Fatal("an empty object took the API out of rotation")
	}
	if _, held := cacheFiles[sdecore.IndustryBonusesFile]; held {
		t.Error("an empty object was warmed as if it were the file")
	}
}

func TestAPartialBuildIsAttemptedAgain(t *testing.T) {
	b := publishedBuild(t, sdecore.IndustryBonusesFile)
	ctx := context.Background()

	if err := warmLiveCache(ctx, b); err != nil {
		t.Fatalf("first warm: %v", err)
	}
	if err := b.Put(ctx, sdecore.LiveKey(sdecore.IndustryBonusesFile), []byte(`{"families":{}}`)); err != nil {
		t.Fatalf("publish the missing file: %v", err)
	}
	if err := warmLiveCache(ctx, b); err != nil {
		t.Fatalf("second warm: %v", err)
	}

	if _, held := cacheFiles[sdecore.IndustryBonusesFile]; !held {
		t.Error("a file published after a partial warm was never picked up")
	}
}

func TestABuildCarryingNothingIsNotReady(t *testing.T) {
	b := publishedBuild(t, sdecore.OutputFileNames()...)

	if err := warmLiveCache(context.Background(), b); err == nil {
		t.Fatal("a build carrying no static data warmed successfully")
	}
	if IsReady() {
		t.Error("a build carrying no static data left the cache ready")
	}
}
