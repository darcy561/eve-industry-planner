package update

import (
	"context"
	"encoding/json"
	"errors"
	sdecore "eve-industry-planner/shared/core/sde"
	"reflect"
	"testing"

	objectstore "eve-industry-planner/shared/core/objectstore"
	"eve-industry-planner/worker/taskrun"
)

func withStageMocks(t *testing.T, mocks map[string]any) {
	t.Helper()

	orig := map[string]any{
		"stageVersionCheck":   stageVersionCheck,
		"stageDownload":       stageDownload,
		"stageMapBuild":       stageMapBuild,
		"stageConversion":     stageConversion,
		"stageBlueprintsSync": stageBlueprintsSync,
		"stagePersist":        stagePersist,
		"stagePersistReplace": stagePersistReplace,
		"stageRecipeDiff":     stageRecipeDiff,
		"stagePrunePrevious":  stagePrunePrevious,
	}

	t.Cleanup(func() {
		stageVersionCheck = orig["stageVersionCheck"].(func(context.Context) (*sdeVersionCheckResult, error))
		stageDownload = orig["stageDownload"].(func(context.Context, *sdeVersionCheckResult) (*sdeDownloadResult, error))
		stageMapBuild = orig["stageMapBuild"].(func(*sdeDownloadResult) (*sdeMapBuildResult, error))
		stageConversion = orig["stageConversion"].(func(*sdeMapBuildResult) (*sdeConversionResult, error))
		stageBlueprintsSync = orig["stageBlueprintsSync"].(func(context.Context, *sdeConversionResult, *taskrun.Dependencies))
		stagePersist = orig["stagePersist"].(func(*sdeVersionCheckResult, *sdeConversionResult) (*sdePersistResult, error))
		stagePersistReplace = orig["stagePersistReplace"].(func(*sdeVersionCheckResult, *sdeConversionResult) (*sdePersistResult, error))
		stageRecipeDiff = orig["stageRecipeDiff"].(func(context.Context, *sdePersistResult, *taskrun.Dependencies) error)
		stagePrunePrevious = orig["stagePrunePrevious"].(func() error)
	})

	for k, v := range mocks {
		switch k {
		case "stageVersionCheck":
			stageVersionCheck = v.(func(context.Context) (*sdeVersionCheckResult, error))
		case "stageDownload":
			stageDownload = v.(func(context.Context, *sdeVersionCheckResult) (*sdeDownloadResult, error))
		case "stageMapBuild":
			stageMapBuild = v.(func(*sdeDownloadResult) (*sdeMapBuildResult, error))
		case "stageConversion":
			stageConversion = v.(func(*sdeMapBuildResult) (*sdeConversionResult, error))
		case "stageBlueprintsSync":
			stageBlueprintsSync = v.(func(context.Context, *sdeConversionResult, *taskrun.Dependencies))
		case "stagePersist":
			stagePersist = v.(func(*sdeVersionCheckResult, *sdeConversionResult) (*sdePersistResult, error))
		case "stagePersistReplace":
			stagePersistReplace = v.(func(*sdeVersionCheckResult, *sdeConversionResult) (*sdePersistResult, error))
		case "stageRecipeDiff":
			stageRecipeDiff = v.(func(context.Context, *sdePersistResult, *taskrun.Dependencies) error)
		case "stagePrunePrevious":
			stagePrunePrevious = v.(func() error)
		default:
			t.Fatalf("unknown mock key %q", k)
		}
	}
}

func TestCheckSDEUpdates_nilTask(t *testing.T) {
	err := CheckSDEUpdates(context.Background(), nil)
	if err == nil {
		t.Fatal("expected error, got nil")
	}
}

func TestCheckSDEUpdates_versionCheckError_shortCircuits(t *testing.T) {
	_ = objectstore.OpenTestStore(t)
	errSentinel := errors.New("version check failed")
	calls := make([]string, 0, 6)

	withStageMocks(t, map[string]any{
		"stageVersionCheck": func(ctx context.Context) (*sdeVersionCheckResult, error) {
			calls = append(calls, "versionCheck")
			return nil, errSentinel
		},
		"stageDownload": func(_ context.Context, _ *sdeVersionCheckResult) (*sdeDownloadResult, error) {
			calls = append(calls, "download")
			return nil, nil
		},
		"stageMapBuild": func(_ *sdeDownloadResult) (*sdeMapBuildResult, error) {
			calls = append(calls, "mapBuild")
			return nil, nil
		},
	})

	err := CheckSDEUpdates(context.Background(), (*taskrun.Dependencies)(nil))
	if !errors.Is(err, errSentinel) {
		t.Fatalf("expected %v, got %v", errSentinel, err)
	}

	want := []string{"versionCheck"}
	if !reflect.DeepEqual(calls, want) {
		t.Fatalf("calls mismatch: got %v want %v", calls, want)
	}
}

func TestCheckSDEUpdates_noUpdate_skipsPersistAndPrune(t *testing.T) {
	_ = objectstore.OpenTestStore(t)
	errSentinel := errors.New("should not be called")
	calls := make([]string, 0, 10)

	withStageMocks(t, map[string]any{
		"stageVersionCheck": func(ctx context.Context) (*sdeVersionCheckResult, error) {
			calls = append(calls, "versionCheck")
			return &sdeVersionCheckResult{NeedsUpdate: false}, nil
		},
		"stageDownload": func(ctx context.Context, v *sdeVersionCheckResult) (*sdeDownloadResult, error) {
			calls = append(calls, "download")
			if v == nil || v.NeedsUpdate {
				t.Fatalf("expected NeedsUpdate=false")
			}
			return &sdeDownloadResult{ExtractedFiles: map[string][]byte{}}, nil
		},
		"stageMapBuild": func(d *sdeDownloadResult) (*sdeMapBuildResult, error) {
			calls = append(calls, "mapBuild")
			return &sdeMapBuildResult{StructuredData: map[string]map[string]any{}}, nil
		},
		"stageConversion": func(m *sdeMapBuildResult) (*sdeConversionResult, error) {
			calls = append(calls, "conversion")
			return &sdeConversionResult{Files: map[string][]byte{}}, nil
		},
		"stageBlueprintsSync": func(_ context.Context, _ *sdeConversionResult, _ *taskrun.Dependencies) {
			calls = append(calls, "blueprintsSync")
		},
		"stagePersist": func(_ *sdeVersionCheckResult, _ *sdeConversionResult) (*sdePersistResult, error) {
			calls = append(calls, "persist")
			return nil, nil
		},
		"stageRecipeDiff": func(_ context.Context, _ *sdePersistResult, _ *taskrun.Dependencies) error {
			calls = append(calls, "recipeDiff")
			return errSentinel
		},
		"stagePrunePrevious": func() error {
			calls = append(calls, "prune")
			return nil
		},
	})

	err := CheckSDEUpdates(context.Background(), (*taskrun.Dependencies)(nil))
	if !errors.Is(err, errSentinel) {
		t.Fatalf("expected %v from recipeDiff mock, got %v", errSentinel, err)
	}

	for _, c := range calls {
		if c == "prune" {
			t.Fatalf("prune was called unexpectedly: calls=%v", calls)
		}
	}
}

func TestCheckSDEUpdates_previousVersion_runsDiffAndPrune(t *testing.T) {
	_ = objectstore.OpenTestStore(t)
	calls := make([]string, 0, 10)

	withStageMocks(t, map[string]any{
		"stageVersionCheck": func(ctx context.Context) (*sdeVersionCheckResult, error) {
			calls = append(calls, "versionCheck")
			return &sdeVersionCheckResult{NeedsUpdate: true}, nil
		},
		"stageDownload": func(ctx context.Context, v *sdeVersionCheckResult) (*sdeDownloadResult, error) {
			calls = append(calls, "download")
			return &sdeDownloadResult{ExtractedFiles: map[string][]byte{"types.jsonl": []byte(`{}`)}}, nil
		},
		"stageMapBuild": func(d *sdeDownloadResult) (*sdeMapBuildResult, error) {
			calls = append(calls, "mapBuild")
			return &sdeMapBuildResult{StructuredData: map[string]map[string]any{"Types": {"k": map[string]any{}}}}, nil
		},
		"stageConversion": func(m *sdeMapBuildResult) (*sdeConversionResult, error) {
			calls = append(calls, "conversion")
			return &sdeConversionResult{Files: map[string][]byte{"output/recipeList.json": []byte(`[]`)}}, nil
		},
		"stageBlueprintsSync": func(_ context.Context, _ *sdeConversionResult, _ *taskrun.Dependencies) {
			calls = append(calls, "blueprintsSync")
		},
		"stagePersist": func(_ *sdeVersionCheckResult, _ *sdeConversionResult) (*sdePersistResult, error) {
			calls = append(calls, "persist")
			return &sdePersistResult{
				HasPreviousVersion:  true,
				CurrentRecipeBytes:  []byte(`[]`),
				PreviousRecipeBytes: []byte(`[]`),
			}, nil
		},
		"stageRecipeDiff": func(_ context.Context, p *sdePersistResult, _ *taskrun.Dependencies) error {
			calls = append(calls, "recipeDiff")
			if p == nil || !p.HasPreviousVersion {
				t.Fatalf("expected previous version in persist result")
			}
			return nil
		},
		"stagePrunePrevious": func() error {
			calls = append(calls, "prune")
			return nil
		},
	})

	err := CheckSDEUpdates(context.Background(), (*taskrun.Dependencies)(nil))
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}

	wantOrder := []string{"versionCheck", "download", "mapBuild", "conversion", "blueprintsSync", "persist", "recipeDiff", "prune"}
	if !reflect.DeepEqual(calls, wantOrder) {
		t.Fatalf("calls mismatch: got %v want %v", calls, wantOrder)
	}
}

func TestRunSDEUpdatePipelineReplacingCurrent_skipsDiffAndPrune(t *testing.T) {
	calls := make([]string, 0, 10)

	withStageMocks(t, map[string]any{
		"stageDownload": func(ctx context.Context, v *sdeVersionCheckResult) (*sdeDownloadResult, error) {
			calls = append(calls, "download")
			return &sdeDownloadResult{ExtractedFiles: map[string][]byte{"types.jsonl": []byte(`{}`)}}, nil
		},
		"stageMapBuild": func(d *sdeDownloadResult) (*sdeMapBuildResult, error) {
			calls = append(calls, "mapBuild")
			return &sdeMapBuildResult{StructuredData: map[string]map[string]any{"Types": {"k": map[string]any{}}}}, nil
		},
		"stageConversion": func(m *sdeMapBuildResult) (*sdeConversionResult, error) {
			calls = append(calls, "conversion")
			return &sdeConversionResult{Files: map[string][]byte{"output/recipeList.json": []byte(`[]`)}}, nil
		},
		"stageBlueprintsSync": func(_ context.Context, _ *sdeConversionResult, _ *taskrun.Dependencies) {
			calls = append(calls, "blueprintsSync")
		},
		"stagePersistReplace": func(_ *sdeVersionCheckResult, _ *sdeConversionResult) (*sdePersistResult, error) {
			calls = append(calls, "persistReplace")
			return &sdePersistResult{HasPreviousVersion: false, CurrentRecipeBytes: []byte(`[]`)}, nil
		},
		"stageRecipeDiff": func(_ context.Context, _ *sdePersistResult, _ *taskrun.Dependencies) error {
			calls = append(calls, "recipeDiff")
			return nil
		},
		"stagePrunePrevious": func() error {
			calls = append(calls, "prune")
			return nil
		},
	})

	err := runSDEUpdatePipelineReplacingCurrent(context.Background(), nil, &sdeVersionCheckResult{})
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}

	wantOrder := []string{"download", "mapBuild", "conversion", "blueprintsSync", "persistReplace"}
	if !reflect.DeepEqual(calls, wantOrder) {
		t.Fatalf("calls mismatch: got %v want %v", calls, wantOrder)
	}
}

func TestRunSDEPersistStageReplaceCurrent_archivesWithVersionSuffix(t *testing.T) {
	b := objectstore.OpenTestStore(t)
	ctx := context.Background()
	seedPersistFixture(t, ctx, b)

	result, err := runSDEPersistStageReplaceCurrent(
		&sdeVersionCheckResult{
			LatestBuildInfo: &latestBuildInfo{
				BuildNumber: 12345,
			},
		},
		&sdeConversionResult{
			Files: map[string][]byte{
				"output/recipeList.json": []byte(`[{"itemID":1}]`),
			},
		},
	)
	if err != nil {
		t.Fatalf("runSDEPersistStageReplaceCurrent failed: %v", err)
	}
	if result == nil || result.ArchiveVersionName != "12345_v2" {
		t.Fatalf("expected archive 12345_v2, got %#v", result)
	}

	archived, err := b.Get(ctx, sdecore.PreviousVersionKey("12345_v2", sdecore.VersionObjectKey))
	if err != nil {
		t.Fatalf("read archived version.json: %v", err)
	}
	var archivedVersion sdecore.VersionJSON
	if err := json.Unmarshal(archived, &archivedVersion); err != nil || archivedVersion.Version != "12345_v2" {
		t.Fatalf("expected archived version label 12345_v2, got %#v err=%v", archivedVersion, err)
	}

	liveVersion, err := sdecore.ReadRootVersionJSON(ctx, b)
	if err != nil || liveVersion == nil || liveVersion.Version != "12345_v3" || liveVersion.BuildNumber != 12345 {
		t.Fatalf("expected live version label/build 12345_v3/12345, got %#v err=%v", liveVersion, err)
	}
}

func TestRunSDEPersistStage_standardPersist_assignsVersionedLiveAndArchiveLabels(t *testing.T) {
	b := objectstore.OpenTestStore(t)
	ctx := context.Background()
	seedPersistFixture(t, ctx, b)

	result, err := runSDEPersistStage(
		&sdeVersionCheckResult{
			LatestBuildInfo: &latestBuildInfo{
				BuildNumber: 12345,
			},
		},
		&sdeConversionResult{
			Files: map[string][]byte{
				"output/recipeList.json": []byte(`[{"itemID":2}]`),
			},
		},
	)
	if err != nil {
		t.Fatalf("runSDEPersistStage failed: %v", err)
	}
	if result == nil || result.ArchiveVersionName != "12345_v2" {
		t.Fatalf("expected archive 12345_v2, got %#v", result)
	}

	archived, err := b.Get(ctx, sdecore.PreviousVersionKey("12345_v2", sdecore.VersionObjectKey))
	if err != nil {
		t.Fatalf("read archived version.json: %v", err)
	}
	var archivedVersion sdecore.VersionJSON
	if err := json.Unmarshal(archived, &archivedVersion); err != nil || archivedVersion.Version != "12345_v2" || archivedVersion.BuildNumber != 12345 {
		t.Fatalf("expected archived version label/build 12345_v2/12345, got %#v err=%v", archivedVersion, err)
	}

	liveVersion, err := sdecore.ReadRootVersionJSON(ctx, b)
	if err != nil || liveVersion == nil || liveVersion.Version != "12345_v3" || liveVersion.BuildNumber != 12345 {
		t.Fatalf("expected live version label/build 12345_v3/12345, got %#v err=%v", liveVersion, err)
	}
}

func seedPersistFixture(t *testing.T, ctx context.Context, b objectstore.Backend) {
	t.Helper()
	if err := b.Put(ctx, sdecore.LiveKey("recipeList.json"), []byte(`[]`)); err != nil {
		t.Fatalf("seed live recipeList: %v", err)
	}
	if err := sdecore.WriteRootVersionJSON(ctx, b, sdecore.VersionJSON{
		Version:     "12345",
		BuildNumber: 12345,
	}); err != nil {
		t.Fatalf("seed root version: %v", err)
	}
	if err := b.Put(ctx, sdecore.PreviousVersionKey("12345_v1", "recipeList.json"), []byte(`[]`)); err != nil {
		t.Fatalf("seed previous recipeList: %v", err)
	}
	if err := b.Put(ctx, sdecore.PreviousVersionKey("12345_v1", sdecore.VersionObjectKey), []byte(`{"version":"12345_v1","build_number":12345}`)); err != nil {
		t.Fatalf("seed previous version.json: %v", err)
	}
}
