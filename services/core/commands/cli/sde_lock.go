package cli

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	sdeshared "eve-industry-planner/worker/tasks/sde/shared"
)

// RunUnlockSdeVersion removes the SDE version lock so scheduled/manual updates can proceed.
func RunUnlockSdeVersion() error {
	dataDir := sdeDataDir()
	lockPath := filepath.Join(dataDir, sdeshared.VersionLockFileName)

	lock, err := sdeshared.ReadVersionLock(dataDir)
	if err != nil {
		return fmt.Errorf("failed reading current SDE version lock from %q: %w", lockPath, err)
	}
	if lock == nil {
		fmt.Printf("SDE version lock is already unlocked (no lock file at %q)\n", lockPath)
		return nil
	}

	if err := os.Remove(lockPath); err != nil {
		if os.IsNotExist(err) {
			fmt.Printf("SDE version lock is already unlocked (no lock file at %q)\n", lockPath)
			return nil
		}
		return fmt.Errorf("failed removing SDE version lock at %q: %w", lockPath, err)
	}

	out := map[string]interface{}{
		"data_dir":         dataDir,
		"lock_path":        lockPath,
		"unlocked":         true,
		"removed_lock":     lock,
		"next_update_hint": "You can now run tasks checkSdeUpdates or tasks applySdeVersion --version=<int>",
	}
	b, err := json.MarshalIndent(out, "", "  ")
	if err != nil {
		return fmt.Errorf("failed formatting unlock output: %w", err)
	}
	fmt.Println(string(b))
	return nil
}

