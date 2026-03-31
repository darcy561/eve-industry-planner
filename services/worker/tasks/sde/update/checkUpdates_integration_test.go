package update

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"eve-industry-planner/worker/tasks/sde/update/conversion"

	"github.com/hibiken/asynq"
)

type previousVersionJSON struct {
	Version     string `json:"version"`
	BuildNumber int    `json:"build_number"`
	GeneratedAt string `json:"generated_at"`
}

func seedPreviousVersion(t *testing.T, dataDir string, buildNumber int) {
	t.Helper()

	liveDir := filepath.Join(dataDir, "live_data")
	if err := os.MkdirAll(liveDir, 0o755); err != nil {
		t.Fatalf("mkdir live_data: %v", err)
	}

	// Minimal recipeList so the diff stage can unmarshal & compare.
	recipeListPath := filepath.Join(liveDir, "recipeList.json")
	if err := os.WriteFile(recipeListPath, []byte(`[]`), 0o644); err != nil {
		t.Fatalf("write seed recipeList.json: %v", err)
	}

	versionPath := filepath.Join(dataDir, "version.json")
	seed := map[string]any{
		"version":      fmt.Sprintf("%d", buildNumber),
		"build_number": buildNumber,
		"release_date": "seed",
	}
	b, err := json.MarshalIndent(seed, "", "  ")
	if err != nil {
		t.Fatalf("marshal seed version.json: %v", err)
	}
	if err := os.WriteFile(versionPath, b, 0o644); err != nil {
		t.Fatalf("write seed version.json: %v", err)
	}
}

func assertFileJSON(t *testing.T, path string, nonEmpty bool) {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	if nonEmpty && len(strings.TrimSpace(string(b))) <= 2 {
		t.Fatalf("expected non-empty json: %s", path)
	}

	// Just validate it parses into something.
	var anyVal any
	if err := json.Unmarshal(b, &anyVal); err != nil {
		t.Fatalf("invalid json at %s: %v", path, err)
	}
}

func TestSDEUpdateWorkflowIntegration_generatesAndVersionFiles(t *testing.T) {
	if os.Getenv("SDE_INTEGRATION") == "" {
		t.Skip("set SDE_INTEGRATION=1 to run live-url integration test")
	}

	// Keep this test non-parallel: it touches the real workflow stages once and then
	// repeatedly persists with the same conversion output.
	ctx := context.Background()

	dataDir := t.TempDir()
	orig := os.Getenv("SDE_DATA_DIR")
	t.Cleanup(func() {
		_ = os.Setenv("SDE_DATA_DIR", orig)
	})
	if err := os.Setenv("SDE_DATA_DIR", dataDir); err != nil {
		t.Fatalf("set SDE_DATA_DIR: %v", err)
	}

	// 1) Download+convert exactly once from the live URL.
	versionResult, err := runSDEVersionCheckStage(ctx, dataDir)
	if err != nil {
		t.Fatalf("runSDEVersionCheckStage failed: %v", err)
	}
	if versionResult == nil || versionResult.LatestBuildInfo == nil {
		t.Fatalf("expected live latest build info")
	}

	baseBuild := versionResult.LatestBuildInfo.BuildNumber
	downloadResult, err := runSDEDownloadStage(ctx, versionResult)
	if err != nil {
		t.Fatalf("runSDEDownloadStage failed: %v", err)
	}
	mapBuildResult, err := runSDEMapBuildStage(downloadResult)
	if err != nil {
		t.Fatalf("runSDEMapBuildStage failed: %v", err)
	}
	conversionResult, err := runSDEConversionStage(mapBuildResult)
	if err != nil {
		t.Fatalf("runSDEConversionStage failed: %v", err)
	}

	// 2) Persist multiple "versions" by only changing the build number.
	// This validates:
	// - archive folder naming is based on the version currently served (from root version.json)
	// - each previous snapshot gets its own version.json (including generated_at)
	// - we keep only the newest 5 previous versions
	totalPersistUpdates := 7 // creates 6 previous snapshots; retention keeps the last 5
	for i := 0; i < totalPersistUpdates; i++ {
		versionResult.LatestBuildInfo.BuildNumber = baseBuild + i
		if versionResult.LatestBuildInfo.ReleaseDate == "" {
			// keep whatever came back from live URL; should never happen, but safe-guard
			versionResult.LatestBuildInfo.ReleaseDate = "unknown"
		}

		persistResult, err := runSDEPersistStage(versionResult, conversionResult)
		if err != nil {
			t.Fatalf("runSDEPersistStage failed at i=%d: %v", i, err)
		}

		// Mimic the workflow: diff then prune.
		if err := runSDENewRecipeItemsStage(ctx, persistResult, nil); err != nil {
			t.Fatalf("runSDENewRecipeItemsStage failed at i=%d: %v", i, err)
		}
		if err := runSDEPrunePreviousVersions(dataDir); err != nil {
			t.Fatalf("runSDEPrunePreviousVersions failed at i=%d: %v", i, err)
		}

		// Ensure archived generated_at timestamps differ.
		// (sort relies on generated_at)
		// Keep this tiny to avoid slowing the test too much.
		//nolint:staticcheck // time.Sleep is fine for test determinism
		// Use a small sleep to guarantee differing instants.
		time.Sleep(10 * time.Millisecond)
	}

	liveDir := filepath.Join(dataDir, "live_data")
	previousRoot := filepath.Join(dataDir, "previous_versions")

	// Validate generated outputs exist and are JSON after the final persist.
	assertFileJSON(t, filepath.Join(liveDir, "recipeList.json"), true)
	assertFileJSON(t, filepath.Join(liveDir, "searchIndex.json"), true)
	assertFileJSON(t, filepath.Join(liveDir, "fullItemList.json"), true)
	assertFileJSON(t, filepath.Join(liveDir, "reprocessingData.json"), true)

	// Validate root version.json build_number matches the last synthetic update.
	rootVersionPath := filepath.Join(dataDir, "version.json")
	rootB, err := os.ReadFile(rootVersionPath)
	if err != nil {
		t.Fatalf("read root version.json: %v", err)
	}
	var root struct {
		BuildNumber int `json:"build_number"`
	}
	if err := json.Unmarshal(rootB, &root); err != nil {
		t.Fatalf("parse root version.json: %v", err)
	}
	expectedRoot := baseBuild + (totalPersistUpdates - 1)
	if root.BuildNumber != expectedRoot {
		t.Fatalf("expected root build_number=%d, got %d", expectedRoot, root.BuildNumber)
	}

	// Validate previous_versions retention policy and version.json generation metadata.
	entries, err := os.ReadDir(previousRoot)
	if err != nil {
		t.Fatalf("read previous_versions: %v", err)
	}
	var prevDirs []string
	for _, e := range entries {
		if e.IsDir() {
			prevDirs = append(prevDirs, e.Name())
		}
	}
	if len(prevDirs) > 5 {
		t.Fatalf("expected <= 5 previous version dirs, got %d (%v)", len(prevDirs), prevDirs)
	}

	// With 7 persists, we expect exactly 5 after pruning.
	if len(prevDirs) != 5 {
		t.Fatalf("expected 5 retained previous version dirs, got %d (%v)", len(prevDirs), prevDirs)
	}

	minExpected := baseBuild + 1
	maxExpected := baseBuild + 5
	for _, dir := range prevDirs {
		prevVersionPath := filepath.Join(previousRoot, dir, "version.json")
		prevB, err := os.ReadFile(prevVersionPath)
		if err != nil {
			t.Fatalf("read prev version.json: %v", err)
		}

		var prev previousVersionJSON
		if err := json.Unmarshal(prevB, &prev); err != nil {
			t.Fatalf("parse prev version.json: %v", err)
		}

		if prev.Version != dir {
			t.Fatalf("expected prev.version=%q to match previous dir=%q", prev.Version, dir)
		}

		if prev.BuildNumber < minExpected || prev.BuildNumber > maxExpected {
			t.Fatalf("retained previous build out of expected range [%d,%d]: got %d (dir=%s)", minExpected, maxExpected, prev.BuildNumber, dir)
		}
		if strings.TrimSpace(prev.GeneratedAt) == "" {
			t.Fatalf("expected archived generated_at to be set (dir=%s)", dir)
		}

		// Ensure each previous dir contains recipeList.json.
		prevRecipePath := filepath.Join(previousRoot, dir, "recipeList.json")
		assertFileJSON(t, prevRecipePath, false)
	}
}

func TestSDEUpdateWorkflowIntegration_parsesRecipeListTypes(t *testing.T) {
	if os.Getenv("SDE_INTEGRATION") == "" || os.Getenv("SDE_INTEGRATION_PARSE") == "" {
		t.Skip("set SDE_INTEGRATION=1 and SDE_INTEGRATION_PARSE=1 to run live-url recipe parse test")
	}

	ctx := context.Background()
	dataDir := t.TempDir()

	if err := os.Setenv("SDE_DATA_DIR", dataDir); err != nil {
		t.Fatalf("set SDE_DATA_DIR: %v", err)
	}

	seedPreviousVersion(t, dataDir, 1)
	if err := CheckSDEUpdates(ctx, asynq.NewTask("checkSDEUpdates", nil), nil); err != nil {
		t.Fatalf("CheckSDEUpdates failed: %v", err)
	}

	recipeListPath := filepath.Join(dataDir, "live_data", "recipeList.json")
	b, err := os.ReadFile(recipeListPath)
	if err != nil {
		t.Fatalf("read recipeList.json: %v", err)
	}

	var recipe []*conversion.EVEType
	if err := json.Unmarshal(b, &recipe); err != nil {
		t.Fatalf("failed unmarshal recipeList into []*conversion.EVEType: %v", err)
	}
	if len(recipe) == 0 {
		t.Fatalf("expected non-empty recipe list")
	}
}
