package update

import (
	"context"
	objectstore "eve-industry-planner/shared/core/objectstore"
	sdecore "eve-industry-planner/shared/core/sde"
	"fmt"
	"time"

	"eve-industry-planner/shared/logs"
	sdepublish "eve-industry-planner/worker/tasks/sde/publish"
)

const maxPreviousVersionsToKeep = sdecore.MaxPreviousVersions

type sdePersistResult struct {
	HasPreviousVersion  bool
	ArchiveVersionName  string
	PreviousRecipeBytes []byte
	CurrentRecipeBytes  []byte
	ReprocessingBytes   []byte
}

func runSDEPersistStage(versionResult *sdeVersionCheckResult, conversionResult *sdeConversionResult) (*sdePersistResult, error) {
	return runSDEPersistStageWithMode(versionResult, conversionResult, false)
}

func runSDEPersistStageReplaceCurrent(versionResult *sdeVersionCheckResult, conversionResult *sdeConversionResult) (*sdePersistResult, error) {
	return runSDEPersistStageWithMode(versionResult, conversionResult, true)
}

func runSDEPersistStageWithMode(versionResult *sdeVersionCheckResult, conversionResult *sdeConversionResult, replaceCurrentOnly bool) (*sdePersistResult, error) {
	if versionResult == nil || conversionResult == nil || len(conversionResult.Files) == 0 {
		logs.DebugCtx(context.Background(), "SDE persist stage skipped; nothing to persist")
		return nil, nil
	}

	ctx := context.Background()
	backend, err := objectstore.OpenStaticData(ctx)
	if err != nil {
		return nil, fmt.Errorf("sde store: %w", err)
	}

	nextVersion, err := buildNextVersion(versionResult)
	if err != nil {
		return nil, err
	}

	pub, err := sdepublish.PublishLive(ctx, backend, conversionResult.Files, nextVersion, replaceCurrentOnly, JSONDataURL)
	if err != nil {
		return nil, err
	}
	if pub == nil {
		return nil, nil
	}

	logs.InfoCtx(ctx, "SDE persist stage completed",
		"backend", backend.Kind(),
		"files_written", len(conversionResult.Files),
		"replace_current_only", replaceCurrentOnly,
		"archive_version", pub.ArchiveVersionName,
		"retained_versions", maxPreviousVersionsToKeep,
	)

	return &sdePersistResult{
		HasPreviousVersion:  pub.HasPreviousVersion,
		ArchiveVersionName:  pub.ArchiveVersionName,
		PreviousRecipeBytes: pub.PreviousRecipeList,
		CurrentRecipeBytes:  pub.CurrentRecipeList,
		ReprocessingBytes:   pub.ReprocessingData,
	}, nil
}

func buildNextVersion(versionResult *sdeVersionCheckResult) (sdecore.VersionJSON, error) {
	if versionResult == nil || versionResult.LatestBuildInfo == nil {
		return sdecore.VersionJSON{}, fmt.Errorf("missing version result for persist")
	}
	// Leave Version empty so PublishLive assigns it after archiving.
	v := sdecore.VersionJSON{
		BuildNumber:  versionResult.LatestBuildInfo.BuildNumber,
		ReleaseDate:  versionResult.LatestBuildInfo.ReleaseDate,
		Key:          versionResult.LatestBuildInfo.Key,
		DownloadURL:  versionResult.LatestBuildInfo.DownloadURL,
		DownloadedAt: time.Now().UTC(),
		GeneratedAt:  time.Now().UTC(),
		Source:       "EVE Online Static Data",
	}
	if v.DownloadURL == "" {
		v.DownloadURL = JSONDataURL
	}
	return v, nil
}

func runSDEPrunePreviousVersions() error {
	ctx := context.Background()
	backend, err := objectstore.OpenStaticData(ctx)
	if err != nil {
		return err
	}
	return sdepublish.PrunePreviousVersions(ctx, backend, maxPreviousVersionsToKeep)
}
