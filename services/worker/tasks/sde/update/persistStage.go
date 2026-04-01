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
	return runSDEPersistStageWithMode(versionResult, conversionResult, false)
}

func runSDEPersistStageReplaceCurrent(versionResult *sdeVersionCheckResult, conversionResult *sdeConversionResult) (*sdePersistResult, error) {
	return runSDEPersistStageWithMode(versionResult, conversionResult, true)
}

func runSDEPersistStageWithMode(versionResult *sdeVersionCheckResult, conversionResult *sdeConversionResult, replaceCurrentOnly bool) (*sdePersistResult, error) {
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

		if replaceCurrentOnly {
			if err := os.MkdirAll(previousRoot, 0o755); err != nil {
				return nil, fmt.Errorf("failed to create previous versions directory for replace-current rebuild: %w", err)
			}

			archiveVersionName := ""
			archiveBuildNumber := 0
			if prevVersionFile != nil {
				archiveVersionName = prevVersionFile.Version
				archiveBuildNumber = prevVersionFile.BuildNumber
			}
			archiveFolderName, err := sdeshared.ResolveArchiveVersionName(previousRoot, archiveVersionName, archiveBuildNumber)
			if err != nil {
				return nil, fmt.Errorf("failed creating rebuild archive version name: %w", err)
			}
			archiveDir = filepath.Join(previousRoot, archiveFolderName)

			if err := sdeshared.AtomicSwapDirs(liveDir, tempLiveDir); err != nil {
				return nil, fmt.Errorf("failed atomic live_data swap for replace-current rebuild: %w", err)
			}

			if err := os.Rename(tempLiveDir, archiveDir); err != nil {
				return nil, fmt.Errorf("failed archiving previous live_data after replace-current rebuild: %w", err)
			}

			archiveVersionFile := prevVersionFile
			if prevVersionFile != nil {
				copyVersion := *prevVersionFile
				copyVersion.Version = archiveFolderName
				archiveVersionFile = &copyVersion
			}
			if err := sdeshared.WriteVersionJSONIntoDir(archiveDir, archiveVersionFile, JSONDataURL); err != nil {
				return nil, fmt.Errorf("failed writing version.json into rebuild archive dir: %w", err)
			}
		} else {
			if err := os.MkdirAll(previousRoot, 0o755); err != nil {
				return nil, fmt.Errorf("failed to create previous versions directory: %w", err)
			}

			// Archive based on the version currently served in live_data (version.json in dataDir),
			// not the latest version we're about to deploy.
			versionFolderName := ""
			versionBuildNumber := 0
			if prevVersionFile != nil {
				versionFolderName = prevVersionFile.Version
				versionBuildNumber = prevVersionFile.BuildNumber
			}
			archiveFolderName, err := sdeshared.ResolveArchiveVersionName(previousRoot, versionFolderName, versionBuildNumber)
			if err != nil {
				return nil, fmt.Errorf("failed creating archive version name: %w", err)
			}
			archiveDir = filepath.Join(previousRoot, archiveFolderName)

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
			archiveVersionFile := prevVersionFile
			if prevVersionFile != nil {
				copyVersion := *prevVersionFile
				copyVersion.Version = archiveFolderName
				archiveVersionFile = &copyVersion
			}
			if err := sdeshared.WriteVersionJSONIntoDir(archiveDir, archiveVersionFile, JSONDataURL); err != nil {
				return nil, fmt.Errorf("failed writing version.json into previous version dir: %w", err)
			}
		}
	} else {
		// First deployment path: no existing live_data.
		if err := os.Rename(tempLiveDir, liveDir); err != nil {
			return nil, fmt.Errorf("failed promoting temp live data: %w", err)
		}
	}

	if err := writeLatestVersionFile(versionResult, previousRoot); err != nil {
		return nil, err
	}

	logs.Info("SDE persist stage completed",
		"live_data_dir", liveDir,
		"files_written", len(conversionResult.Files),
		"replace_current_only", replaceCurrentOnly,
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

func writeLatestVersionFile(versionResult *sdeVersionCheckResult, previousRoot string) error {
	if versionResult == nil || versionResult.LatestBuildInfo == nil {
		return nil
	}

	versionLabel, err := sdeshared.NextBuildVersionName(previousRoot, versionResult.LatestBuildInfo.BuildNumber)
	if err != nil {
		return fmt.Errorf("failed creating live version label: %w", err)
	}

	v := sdeshared.StoredVersionJSON{
		Version:      versionLabel,
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
