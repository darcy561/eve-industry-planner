package rollback

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"eve-industry-planner/shared/shared/logs"
	esitasks "eve-industry-planner/worker/tasks/esi"
	sdeshared "eve-industry-planner/worker/tasks/sde/shared"

	"github.com/hibiken/asynq"
)

// RollbackSDEVersion atomically rolls live_data back to the most recent previous version.
// The previously live snapshot is archived back into previous_versions with its own version.json.
func RollbackSDEVersion(ctx context.Context, task *asynq.Task, deps *esitasks.TaskDependencies) error {
	if task == nil {
		return fmt.Errorf("task is nil")
	}

	_ = deps
	ctx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()

	dataDir := os.Getenv("SDE_DATA_DIR")
	if dataDir == "" {
		dataDir = sdeshared.DefaultDataDir
	}

	liveDir := filepath.Join(dataDir, sdeshared.LiveDataDirName)
	previousRoot := filepath.Join(dataDir, sdeshared.PreviousVersionsDirName)

	if _, err := os.Stat(liveDir); err != nil {
		if os.IsNotExist(err) {
			return fmt.Errorf("cannot rollback: live_data does not exist")
		}
		return fmt.Errorf("failed checking live_data: %w", err)
	}

	currentRootVersion, err := sdeshared.ReadRootVersionJSON(dataDir)
	if err != nil {
		return fmt.Errorf("failed reading root version.json: %w", err)
	}

	rollbackDir, rollbackVersion, err := sdeshared.GetLatestPreviousVersionDir(previousRoot)
	if err != nil {
		return err
	}
	if rollbackDir == "" {
		return fmt.Errorf("cannot rollback: no previous versions available")
	}
	if rollbackVersion == nil || (rollbackVersion.BuildNumber == 0 && rollbackVersion.Version == "") {
		return fmt.Errorf("cannot rollback: latest previous version is missing version.json metadata")
	}

	// Atomic exchange so readers always see a full live_data directory.
	if err := sdeshared.AtomicSwapDirs(liveDir, rollbackDir); err != nil {
		return fmt.Errorf("failed atomic rollback swap: %w", err)
	}

	// rollbackDir now contains the old live data; archive it with the old live version identifier.
	archiveFolderName := sdeshared.SanitizeVersionFolder("unknown")
	if currentRootVersion != nil {
		if currentRootVersion.Version != "" {
			archiveFolderName = sdeshared.SanitizeVersionFolder(currentRootVersion.Version)
		} else if currentRootVersion.BuildNumber != 0 {
			archiveFolderName = sdeshared.SanitizeVersionFolder(sdeshared.IntToString(currentRootVersion.BuildNumber))
		}
	}

	archiveDir := filepath.Join(previousRoot, archiveFolderName)
	if archiveDir != rollbackDir {
		if _, err := os.Stat(archiveDir); err == nil {
			// Keep a single folder per build/version: replace existing archive snapshot.
			if err := os.RemoveAll(archiveDir); err != nil {
				return fmt.Errorf("failed removing existing rollback archive dir: %w", err)
			}
		}
		if err := os.Rename(rollbackDir, archiveDir); err != nil {
			return fmt.Errorf("failed archiving rolled-back live_data: %w", err)
		}
	}

	if err := sdeshared.WriteVersionJSONIntoDir(archiveDir, currentRootVersion, ""); err != nil {
		return fmt.Errorf("failed writing archived rollback version metadata: %w", err)
	}

	// Promote rolled-back version metadata to root version.json.
	rollbackVersion.GeneratedAt = time.Now().UTC()
	if err := sdeshared.WriteRootVersionJSON(dataDir, *rollbackVersion); err != nil {
		return fmt.Errorf("failed writing root version after rollback: %w", err)
	}

	if err := sdeshared.WriteVersionLock(dataDir, sdeshared.VersionLock{
		Version:     rollbackVersion.Version,
		BuildNumber: rollbackVersion.BuildNumber,
		LockedAt:    time.Now().UTC(),
		Source:      "rollbackSDEVersion",
		Reason:      "locked after rollback",
	}); err != nil {
		return fmt.Errorf("failed writing version lock after rollback: %w", err)
	}

	if err := sdeshared.PrunePreviousVersions(previousRoot, sdeshared.MaxPreviousVersionsToKeep); err != nil {
		return err
	}

	logs.Info("SDE rollback completed",
		"data_dir", dataDir,
		"rolled_back_from", archiveDir,
		"rolled_back_to", liveDir,
	)

	return nil
}
