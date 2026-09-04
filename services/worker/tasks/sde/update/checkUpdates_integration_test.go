package update

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	objectstore "eve-industry-planner/shared/core/objectstore"
	sdecore "eve-industry-planner/shared/core/sde"
	"eve-industry-planner/worker/tasks/sde/update/conversion"
)

type previousVersionJSON struct {
	Version     string `json:"version"`
	BuildNumber int    `json:"build_number"`
	GeneratedAt string `json:"generated_at"`
}

func expectBuildVersionLabel(t *testing.T, label string, buildNumber int) {
	t.Helper()
	expectedPrefix := fmt.Sprintf("%d_v", buildNumber)
	if !strings.HasPrefix(label, expectedPrefix) {
		t.Fatalf("expected version label %q to start with %q", label, expectedPrefix)
	}
}

func assertObjectJSON(t *testing.T, b objectstore.Backend, key string, nonEmpty bool) {
	t.Helper()
	data, err := b.Get(context.Background(), key)
	if err != nil {
		t.Fatalf("get %s: %v", key, err)
	}
	if nonEmpty && len(strings.TrimSpace(string(data))) <= 2 {
		t.Fatalf("expected non-empty json: %s", key)
	}
	var anyVal any
	if err := json.Unmarshal(data, &anyVal); err != nil {
		t.Fatalf("invalid json at %s: %v", key, err)
	}
}

func seedPreviousVersion(t *testing.T, b objectstore.Backend, buildNumber int) {
	t.Helper()
	ctx := context.Background()
	if err := b.Put(ctx, sdecore.LiveKey(sdecore.RecipeListFile), []byte(`[]`)); err != nil {
		t.Fatalf("seed recipeList: %v", err)
	}
	if err := sdecore.WriteRootVersionJSON(ctx, b, sdecore.VersionJSON{
		Version:     fmt.Sprintf("%d", buildNumber),
		BuildNumber: buildNumber,
		ReleaseDate: "seed",
	}); err != nil {
		t.Fatalf("seed version: %v", err)
	}
}

func TestSDEUpdateWorkflowIntegration_buildsLatestSDEAndWritesDataFiles(t *testing.T) {
	if os.Getenv("SDE_INTEGRATION") == "" {
		t.Skip("set SDE_INTEGRATION=1 to run live-url integration test")
	}

	b := objectstore.OpenTestStore(t)
	ctx := context.Background()

	versionResult, err := runSDEVersionCheckStage(ctx)
	if err != nil {
		t.Fatalf("runSDEVersionCheckStage failed: %v", err)
	}
	if versionResult == nil || versionResult.LatestBuildInfo == nil {
		t.Fatalf("expected live latest build info")
	}

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
	if _, err := runSDEPersistStage(versionResult, conversionResult); err != nil {
		t.Fatalf("runSDEPersistStage failed: %v", err)
	}

	assertObjectJSON(t, b, sdecore.LiveKey(sdecore.RecipeListFile), true)
	assertObjectJSON(t, b, sdecore.LiveKey(sdecore.SearchIndexFile), true)
	assertObjectJSON(t, b, sdecore.LiveKey(sdecore.FullItemListFile), true)
	assertObjectJSON(t, b, sdecore.LiveKey(sdecore.ReprocessingFile), true)
	assertObjectJSON(t, b, sdecore.LiveKey(sdecore.InventionModifiersFile), true)

	root, err := sdecore.ReadRootVersionJSON(ctx, b)
	if err != nil || root == nil {
		t.Fatalf("read root version: %v %#v", err, root)
	}
	if root.BuildNumber != versionResult.LatestBuildInfo.BuildNumber {
		t.Fatalf("expected root build_number=%d, got %d", versionResult.LatestBuildInfo.BuildNumber, root.BuildNumber)
	}
	expectBuildVersionLabel(t, root.Version, root.BuildNumber)
}

func TestSDEUpdateWorkflowIntegration_generatesAndVersionFiles(t *testing.T) {
	if os.Getenv("SDE_INTEGRATION") == "" {
		t.Skip("set SDE_INTEGRATION=1 to run live-url integration test")
	}

	b := objectstore.OpenTestStore(t)
	ctx := context.Background()

	versionResult, err := runSDEVersionCheckStage(ctx)
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

	totalPersistUpdates := 7
	for i := range totalPersistUpdates {
		versionResult.LatestBuildInfo.BuildNumber = baseBuild + i
		if versionResult.LatestBuildInfo.ReleaseDate == "" {
			versionResult.LatestBuildInfo.ReleaseDate = "unknown"
		}

		persistResult, err := runSDEPersistStage(versionResult, conversionResult)
		if err != nil {
			t.Fatalf("runSDEPersistStage failed at i=%d: %v", i, err)
		}
		if err := runSDENewRecipeItemsStage(ctx, persistResult, nil); err != nil {
			t.Fatalf("runSDENewRecipeItemsStage failed at i=%d: %v", i, err)
		}
		if err := runSDEPrunePreviousVersions(); err != nil {
			t.Fatalf("runSDEPrunePreviousVersions failed at i=%d: %v", i, err)
		}
		time.Sleep(10 * time.Millisecond)
	}

	assertObjectJSON(t, b, sdecore.LiveKey(sdecore.RecipeListFile), true)
	assertObjectJSON(t, b, sdecore.LiveKey(sdecore.SearchIndexFile), true)
	assertObjectJSON(t, b, sdecore.LiveKey(sdecore.FullItemListFile), true)
	assertObjectJSON(t, b, sdecore.LiveKey(sdecore.ReprocessingFile), true)
	assertObjectJSON(t, b, sdecore.LiveKey(sdecore.InventionModifiersFile), true)

	root, err := sdecore.ReadRootVersionJSON(ctx, b)
	if err != nil || root == nil {
		t.Fatalf("read root version: %v %#v", err, root)
	}
	expectedRoot := baseBuild + (totalPersistUpdates - 1)
	if root.BuildNumber != expectedRoot {
		t.Fatalf("expected root build_number=%d, got %d", expectedRoot, root.BuildNumber)
	}
	expectBuildVersionLabel(t, root.Version, root.BuildNumber)

	prevDirs, err := b.ListChildNames(ctx, sdecore.PreviousVersionsPrefix)
	if err != nil {
		t.Fatalf("list previous_versions: %v", err)
	}
	if len(prevDirs) != 5 {
		t.Fatalf("expected 5 retained previous version dirs, got %d (%v)", len(prevDirs), prevDirs)
	}

	minExpected := baseBuild + 1
	maxExpected := baseBuild + 5
	for _, dir := range prevDirs {
		prevB, err := b.Get(ctx, sdecore.PreviousVersionKey(dir, sdecore.VersionObjectKey))
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
		expectBuildVersionLabel(t, prev.Version, prev.BuildNumber)
		if prev.BuildNumber < minExpected || prev.BuildNumber > maxExpected {
			t.Fatalf("retained previous build out of expected range [%d,%d]: got %d (dir=%s)", minExpected, maxExpected, prev.BuildNumber, dir)
		}
		if strings.TrimSpace(prev.GeneratedAt) == "" {
			t.Fatalf("expected archived generated_at to be set (dir=%s)", dir)
		}
		assertObjectJSON(t, b, sdecore.PreviousVersionKey(dir, sdecore.RecipeListFile), false)
	}
}

func TestSDEUpdateWorkflowIntegration_parsesRecipeListTypes(t *testing.T) {
	if os.Getenv("SDE_INTEGRATION") == "" || os.Getenv("SDE_INTEGRATION_PARSE") == "" {
		t.Skip("set SDE_INTEGRATION=1 and SDE_INTEGRATION_PARSE=1 to run live-url recipe parse test")
	}

	b := objectstore.OpenTestStore(t)
	ctx := context.Background()
	seedPreviousVersion(t, b, 1)

	if err := CheckSDEUpdates(ctx, nil); err != nil {
		t.Fatalf("CheckSDEUpdates failed: %v", err)
	}

	data, err := b.Get(ctx, sdecore.LiveKey(sdecore.RecipeListFile))
	if err != nil {
		t.Fatalf("read recipeList.json: %v", err)
	}
	var recipe []*conversion.EVEType
	if err := json.Unmarshal(data, &recipe); err != nil {
		t.Fatalf("failed unmarshal recipeList into []*conversion.EVEType: %v", err)
	}
}
