package update

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	esitasks "eve-industry-planner/worker/tasks/esi"
	sdeshared "eve-industry-planner/worker/tasks/sde/shared"

	"github.com/hibiken/asynq"
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
		stageVersionCheck = orig["stageVersionCheck"].(func(context.Context, string) (*sdeVersionCheckResult, error))
		stageDownload = orig["stageDownload"].(func(context.Context, *sdeVersionCheckResult) (*sdeDownloadResult, error))
		stageMapBuild = orig["stageMapBuild"].(func(*sdeDownloadResult) (*sdeMapBuildResult, error))
		stageConversion = orig["stageConversion"].(func(*sdeMapBuildResult) (*sdeConversionResult, error))
		stageBlueprintsSync = orig["stageBlueprintsSync"].(func(context.Context, *sdeConversionResult, *esitasks.TaskDependencies))
		stagePersist = orig["stagePersist"].(func(*sdeVersionCheckResult, *sdeConversionResult) (*sdePersistResult, error))
		stagePersistReplace = orig["stagePersistReplace"].(func(*sdeVersionCheckResult, *sdeConversionResult) (*sdePersistResult, error))
		stageRecipeDiff = orig["stageRecipeDiff"].(func(context.Context, *sdePersistResult, *esitasks.TaskDependencies) error)
		stagePrunePrevious = orig["stagePrunePrevious"].(func(string) error)
	})

	// Apply mocks
	for k, v := range mocks {
		switch k {
		case "stageVersionCheck":
			stageVersionCheck = v.(func(context.Context, string) (*sdeVersionCheckResult, error))
		case "stageDownload":
			stageDownload = v.(func(context.Context, *sdeVersionCheckResult) (*sdeDownloadResult, error))
		case "stageMapBuild":
			stageMapBuild = v.(func(*sdeDownloadResult) (*sdeMapBuildResult, error))
		case "stageConversion":
			stageConversion = v.(func(*sdeMapBuildResult) (*sdeConversionResult, error))
		case "stageBlueprintsSync":
			stageBlueprintsSync = v.(func(context.Context, *sdeConversionResult, *esitasks.TaskDependencies))
		case "stagePersist":
			stagePersist = v.(func(*sdeVersionCheckResult, *sdeConversionResult) (*sdePersistResult, error))
		case "stagePersistReplace":
			stagePersistReplace = v.(func(*sdeVersionCheckResult, *sdeConversionResult) (*sdePersistResult, error))
		case "stageRecipeDiff":
			stageRecipeDiff = v.(func(context.Context, *sdePersistResult, *esitasks.TaskDependencies) error)
		case "stagePrunePrevious":
			stagePrunePrevious = v.(func(string) error)
		default:
			t.Fatalf("unknown mock key %q", k)
		}
	}
}

func TestCheckSDEUpdates_nilTask(t *testing.T) {
	err := CheckSDEUpdates(context.Background(), nil, nil)
	if err == nil {
		t.Fatal("expected error, got nil")
	}
}

func TestCheckSDEUpdates_versionCheckError_shortCircuits(t *testing.T) {
	// Don't t.Parallel: we mutate global stage variables.
	errSentinel := errors.New("version check failed")
	calls := make([]string, 0, 6)

	withStageMocks(t, map[string]any{
		"stageVersionCheck": func(ctx context.Context, dataDir string) (*sdeVersionCheckResult, error) {
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

	err := CheckSDEUpdates(context.Background(), asynq.NewTask("checkSDEUpdates", nil), (*esitasks.TaskDependencies)(nil))
	if !errors.Is(err, errSentinel) {
		t.Fatalf("expected %v, got %v", errSentinel, err)
	}

	want := []string{"versionCheck"}
	if !reflect.DeepEqual(calls, want) {
		t.Fatalf("calls mismatch: got %v want %v", calls, want)
	}
}

func TestCheckSDEUpdates_noUpdate_skipsPersistAndPrune(t *testing.T) {
	errSentinel := errors.New("should not be called")
	calls := make([]string, 0, 10)

	// Ensure deterministic env var usage and restore afterwards
	origEnv := os.Getenv("SDE_DATA_DIR")
	_ = os.Setenv("SDE_DATA_DIR", "/tmp/sde")
	t.Cleanup(func() {
		_ = os.Setenv("SDE_DATA_DIR", origEnv)
	})

	withStageMocks(t, map[string]any{
		"stageVersionCheck": func(ctx context.Context, dataDir string) (*sdeVersionCheckResult, error) {
			calls = append(calls, "versionCheck")
			if dataDir != "/tmp/sde" {
				t.Fatalf("dataDir mismatch: got %q want %q", dataDir, "/tmp/sde")
			}
			return &sdeVersionCheckResult{DataDir: dataDir, NeedsUpdate: false}, nil
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
			return &sdeMapBuildResult{StructuredData: map[string]map[string]interface{}{}}, nil
		},
		"stageConversion": func(m *sdeMapBuildResult) (*sdeConversionResult, error) {
			calls = append(calls, "conversion")
			return &sdeConversionResult{Files: map[string][]byte{}}, nil
		},
		"stageBlueprintsSync": func(_ context.Context, _ *sdeConversionResult, _ *esitasks.TaskDependencies) {
			calls = append(calls, "blueprintsSync")
		},
		"stagePersist": func(_ *sdeVersionCheckResult, _ *sdeConversionResult) (*sdePersistResult, error) {
			calls = append(calls, "persist")
			// persist should return nil when there's nothing to persist
			return nil, nil
		},
		"stageRecipeDiff": func(_ context.Context, _ *sdePersistResult, _ *esitasks.TaskDependencies) error {
			calls = append(calls, "recipeDiff")
			return errSentinel
		},
		"stagePrunePrevious": func(_ string) error {
			calls = append(calls, "prune")
			return nil
		},
	})

	// Since persist returns nil, recipeDiff should still be called (workflow calls it),
	// but we can validate that prune is not called.
	err := CheckSDEUpdates(context.Background(), asynq.NewTask("checkSDEUpdates", nil), (*esitasks.TaskDependencies)(nil))
	if !errors.Is(err, errSentinel) {
		t.Fatalf("expected %v from recipeDiff mock, got %v", errSentinel, err)
	}

	// prune must not be called
	for _, c := range calls {
		if c == "prune" {
			t.Fatalf("prune was called unexpectedly: calls=%v", calls)
		}
	}
}

func TestCheckSDEUpdates_previousVersion_runsDiffAndPrune(t *testing.T) {
	calls := make([]string, 0, 10)

	withStageMocks(t, map[string]any{
		"stageVersionCheck": func(ctx context.Context, dataDir string) (*sdeVersionCheckResult, error) {
			calls = append(calls, "versionCheck")
			return &sdeVersionCheckResult{DataDir: dataDir, NeedsUpdate: true}, nil
		},
		"stageDownload": func(ctx context.Context, v *sdeVersionCheckResult) (*sdeDownloadResult, error) {
			calls = append(calls, "download")
			return &sdeDownloadResult{ExtractedFiles: map[string][]byte{"types.jsonl": []byte(`{}`)}}, nil
		},
		"stageMapBuild": func(d *sdeDownloadResult) (*sdeMapBuildResult, error) {
			calls = append(calls, "mapBuild")
			return &sdeMapBuildResult{StructuredData: map[string]map[string]interface{}{"Types": {"k": map[string]interface{}{}}}}, nil
		},
		"stageConversion": func(m *sdeMapBuildResult) (*sdeConversionResult, error) {
			calls = append(calls, "conversion")
			return &sdeConversionResult{Files: map[string][]byte{"output/recipeList.json": []byte(`[]`)}}, nil
		},
		"stageBlueprintsSync": func(_ context.Context, _ *sdeConversionResult, _ *esitasks.TaskDependencies) {
			calls = append(calls, "blueprintsSync")
		},
		"stagePersist": func(_ *sdeVersionCheckResult, _ *sdeConversionResult) (*sdePersistResult, error) {
			calls = append(calls, "persist")
			return &sdePersistResult{
				HasPreviousVersion: true,
				PreviousRecipeList: "/prev/recipeList.json",
				CurrentRecipeList:  "/live/recipeList.json",
				PreviousVersionDir: "/prev",
			}, nil
		},
		"stageRecipeDiff": func(_ context.Context, p *sdePersistResult, _ *esitasks.TaskDependencies) error {
			calls = append(calls, "recipeDiff")
			if p == nil || !p.HasPreviousVersion {
				t.Fatalf("expected previous version in persist result")
			}
			return nil
		},
		"stagePrunePrevious": func(dataDir string) error {
			calls = append(calls, "prune")
			if dataDir == "" {
				t.Fatalf("expected non-empty dataDir")
			}
			return nil
		},
	})

	err := CheckSDEUpdates(context.Background(), asynq.NewTask("checkSDEUpdates", nil), (*esitasks.TaskDependencies)(nil))
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}

	// Validate ordering.
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
			return &sdeMapBuildResult{StructuredData: map[string]map[string]interface{}{"Types": {"k": map[string]interface{}{}}}}, nil
		},
		"stageConversion": func(m *sdeMapBuildResult) (*sdeConversionResult, error) {
			calls = append(calls, "conversion")
			return &sdeConversionResult{Files: map[string][]byte{"output/recipeList.json": []byte(`[]`)}}, nil
		},
		"stageBlueprintsSync": func(_ context.Context, _ *sdeConversionResult, _ *esitasks.TaskDependencies) {
			calls = append(calls, "blueprintsSync")
		},
		"stagePersistReplace": func(_ *sdeVersionCheckResult, _ *sdeConversionResult) (*sdePersistResult, error) {
			calls = append(calls, "persistReplace")
			return &sdePersistResult{HasPreviousVersion: false, CurrentRecipeList: "/live/recipeList.json"}, nil
		},
		"stageRecipeDiff": func(_ context.Context, _ *sdePersistResult, _ *esitasks.TaskDependencies) error {
			calls = append(calls, "recipeDiff")
			return nil
		},
		"stagePrunePrevious": func(_ string) error {
			calls = append(calls, "prune")
			return nil
		},
	})

	err := runSDEUpdatePipelineReplacingCurrent(context.Background(), nil, &sdeVersionCheckResult{DataDir: "/tmp/sde"})
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}

	wantOrder := []string{"download", "mapBuild", "conversion", "blueprintsSync", "persistReplace"}
	if !reflect.DeepEqual(calls, wantOrder) {
		t.Fatalf("calls mismatch: got %v want %v", calls, wantOrder)
	}
}

func TestRunSDEPersistStageReplaceCurrent_archivesWithVersionSuffix(t *testing.T) {
	dataDir := t.TempDir()
	liveDir := filepath.Join(dataDir, liveDataDirName)
	if err := os.MkdirAll(liveDir, 0o755); err != nil {
		t.Fatalf("mkdir live dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(liveDir, "recipeList.json"), []byte(`[]`), 0o644); err != nil {
		t.Fatalf("write current recipe list: %v", err)
	}

	rootVersion := sdeshared.StoredVersionJSON{
		Version:     "12345",
		BuildNumber: 12345,
	}
	if err := sdeshared.WriteRootVersionJSON(dataDir, rootVersion); err != nil {
		t.Fatalf("write root version: %v", err)
	}

	previousRoot := filepath.Join(dataDir, previousVersionsDirName)
	if err := os.MkdirAll(filepath.Join(previousRoot, "12345_v1"), 0o755); err != nil {
		t.Fatalf("mkdir existing archive: %v", err)
	}

	result, err := runSDEPersistStageReplaceCurrent(
		&sdeVersionCheckResult{
			DataDir: dataDir,
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

	wantArchiveDir := filepath.Join(previousRoot, "12345_v2")
	if result == nil || result.PreviousVersionDir != wantArchiveDir {
		t.Fatalf("expected PreviousVersionDir=%q, got %#v", wantArchiveDir, result)
	}

	if _, err := os.Stat(wantArchiveDir); err != nil {
		t.Fatalf("expected archive dir to exist: %v", err)
	}

	archivedVersion, err := sdeshared.ReadRootVersionJSON(wantArchiveDir)
	if err != nil {
		t.Fatalf("read archived version.json: %v", err)
	}
	if archivedVersion == nil || archivedVersion.Version != "12345_v2" {
		t.Fatalf("expected archived version label 12345_v2, got %#v", archivedVersion)
	}

	liveVersion, err := sdeshared.ReadRootVersionJSON(dataDir)
	if err != nil {
		t.Fatalf("read live root version.json: %v", err)
	}
	if liveVersion == nil || liveVersion.Version != "12345_v3" || liveVersion.BuildNumber != 12345 {
		t.Fatalf("expected live version label/build 12345_v3/12345, got %#v", liveVersion)
	}
}

func TestRunSDEPersistStage_standardPersist_assignsVersionedLiveAndArchiveLabels(t *testing.T) {
	dataDir := t.TempDir()
	liveDir := filepath.Join(dataDir, liveDataDirName)
	if err := os.MkdirAll(liveDir, 0o755); err != nil {
		t.Fatalf("mkdir live dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(liveDir, "recipeList.json"), []byte(`[]`), 0o644); err != nil {
		t.Fatalf("write current recipe list: %v", err)
	}

	rootVersion := sdeshared.StoredVersionJSON{
		Version:     "12345",
		BuildNumber: 12345,
	}
	if err := sdeshared.WriteRootVersionJSON(dataDir, rootVersion); err != nil {
		t.Fatalf("write root version: %v", err)
	}

	previousRoot := filepath.Join(dataDir, previousVersionsDirName)
	if err := os.MkdirAll(filepath.Join(previousRoot, "12345_v1"), 0o755); err != nil {
		t.Fatalf("mkdir existing archive: %v", err)
	}

	result, err := runSDEPersistStage(
		&sdeVersionCheckResult{
			DataDir: dataDir,
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

	wantArchiveDir := filepath.Join(previousRoot, "12345_v2")
	if result == nil || result.PreviousVersionDir != wantArchiveDir {
		t.Fatalf("expected PreviousVersionDir=%q, got %#v", wantArchiveDir, result)
	}

	archivedVersion, err := sdeshared.ReadRootVersionJSON(wantArchiveDir)
	if err != nil {
		t.Fatalf("read archived version.json: %v", err)
	}
	if archivedVersion == nil || archivedVersion.Version != "12345_v2" || archivedVersion.BuildNumber != 12345 {
		t.Fatalf("expected archived version label/build 12345_v2/12345, got %#v", archivedVersion)
	}

	liveVersion, err := sdeshared.ReadRootVersionJSON(dataDir)
	if err != nil {
		t.Fatalf("read live root version.json: %v", err)
	}
	if liveVersion == nil || liveVersion.Version != "12345_v3" || liveVersion.BuildNumber != 12345 {
		t.Fatalf("expected live version label/build 12345_v3/12345, got %#v", liveVersion)
	}
}
