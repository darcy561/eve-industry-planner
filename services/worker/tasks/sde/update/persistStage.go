package update

import (
	"fmt"
	"os"
	"path/filepath"
	"time"

	sdecore "eve-industry-planner/shared/core/sde"
	"eve-industry-planner/shared/shared/logs"
	sdeshared "eve-industry-planner/worker/tasks/sde/shared"
)

const (
	liveDataDirName           = sdeshared.LiveDataDirName
	previousVersionsDirName   = sdeshared.PreviousVersionsDirName
	maxPreviousVersionsToKeep = sdeshared.MaxPreviousVersionsToKeep
)

type sdePersistResult struct {
	LiveDataDir        string
	HasPreviousVersion bool
	PreviousVersionDir string
	PreviousRecipeList string
	CurrentRecipeList  string
}

func runSDEPersistStage(versionResult *sdeVersionCheckResult, conversionResult *sdeConversionResult) (*sdePersistResult, error) {
	if versionResult == nil || conversionResult == nil || len(conversionResult.Files) == 0 {
		logs.Debug("SDE persist stage skipped; nothing to persist")
		return nil, nil
	}

	dataDir := versionResult.DataDir
	liveDir := filepath.Join(dataDir, liveDataDirName)
	tempLiveDir := filepath.Join(dataDir, fmt.Sprintf(".%s.tmp.%d", liveDataDirName, time.Now().UnixNano()))
	previousRoot := filepath.Join(dataDir, previousVersionsDirName)
	archiveDir := ""
	hasPrevious := false
	var prevVersionFile *sdeshared.StoredVersionJSON

	if err := os.MkdirAll(tempLiveDir, 0o755); err != nil {
		return nil, fmt.Errorf("failed to create temp live data dir: %w", err)
	}

	// Build the full next live_data folder first; swap it in with a single rename.
	for logicalPath, contents := range conversionResult.Files {
		fileName := filepath.Base(logicalPath)
		targetPath := filepath.Join(tempLiveDir, fileName)
		if err := sdeshared.AtomicWriteFile(targetPath, contents, 0o644); err != nil {
			return nil, fmt.Errorf("failed writing temp output file %s: %w", fileName, err)
		}
	}

	if _, err := os.Stat(liveDir); err == nil {
		hasPrevious = true
		prevVersionFile, _ = sdeshared.ReadRootVersionJSON(dataDir)
		if err := os.MkdirAll(previousRoot, 0o755); err != nil {
			return nil, fmt.Errorf("failed to create previous versions directory: %w", err)
		}

		// Archive based on the version currently served in live_data (version.json in dataDir),
		// not the latest version we're about to deploy.
		versionFolderName := sdeshared.SanitizeVersionFolder("unknown")
		if prevVersionFile != nil {
			if prevVersionFile.Version != "" {
				versionFolderName = sdeshared.SanitizeVersionFolder(prevVersionFile.Version)
			} else if prevVersionFile.BuildNumber != 0 {
				versionFolderName = sdeshared.SanitizeVersionFolder(sdeshared.IntToString(prevVersionFile.BuildNumber))
			}
		}
		archiveDir = filepath.Join(previousRoot, versionFolderName)
		if _, err := os.Stat(archiveDir); err == nil {
			// Keep a single folder per build/version: replace existing archive snapshot.
			if err := os.RemoveAll(archiveDir); err != nil {
				return nil, fmt.Errorf("failed removing existing archived version dir: %w", err)
			}
		}

		// Atomic directory exchange: readers never see a missing live_data folder.
		if err := sdeshared.AtomicSwapDirs(liveDir, tempLiveDir); err != nil {
			return nil, fmt.Errorf("failed atomic live_data swap: %w", err)
		}

		// tempLiveDir now contains the previous live data after the exchange.
		if err := os.Rename(tempLiveDir, archiveDir); err != nil {
			return nil, fmt.Errorf("failed archiving previous live_data: %w", err)
		}

		// Write version.json into the archived folder so later diffs/pruning can inspect
		// both version and generation date.
		if err := sdeshared.WriteVersionJSONIntoDir(archiveDir, prevVersionFile, JSONDataURL); err != nil {
			return nil, fmt.Errorf("failed writing version.json into previous version dir: %w", err)
		}
	} else {
		// First deployment path: no existing live_data.
		if err := os.Rename(tempLiveDir, liveDir); err != nil {
			return nil, fmt.Errorf("failed promoting temp live data: %w", err)
		}
	}

	if err := writeLatestVersionFile(versionResult); err != nil {
		return nil, err
	}

	logs.Info("SDE persist stage completed",
		"live_data_dir", liveDir,
		"files_written", len(conversionResult.Files),
		"previous_versions_dir", previousRoot,
		"retained_versions", maxPreviousVersionsToKeep,
	)

	prevRecipe := ""
	if hasPrevious && archiveDir != "" {
		prevRecipe = filepath.Join(archiveDir, sdecore.RecipeListFile)
	}

	return &sdePersistResult{
		LiveDataDir:        liveDir,
		HasPreviousVersion: hasPrevious,
		PreviousVersionDir: archiveDir,
		PreviousRecipeList: prevRecipe,
		CurrentRecipeList:  filepath.Join(liveDir, sdecore.RecipeListFile),
	}, nil
}

func writeLatestVersionFile(versionResult *sdeVersionCheckResult) error {
	if versionResult == nil || versionResult.LatestBuildInfo == nil {
		return nil
	}

	v := sdeshared.StoredVersionJSON{
		Version:      sdeshared.IntToString(versionResult.LatestBuildInfo.BuildNumber),
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
	if err := sdeshared.WriteRootVersionJSON(versionResult.DataDir, v); err != nil {
		return fmt.Errorf("failed writing version.json: %w", err)
	}
	return nil
}

func runSDEPrunePreviousVersions(dataDir string) error {
	previousRoot := filepath.Join(dataDir, previousVersionsDirName)
	if err := sdeshared.PrunePreviousVersions(previousRoot, maxPreviousVersionsToKeep); err != nil {
		return err
	}
	return nil
}
