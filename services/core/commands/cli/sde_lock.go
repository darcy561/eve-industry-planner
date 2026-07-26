package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	sdecore "eve-industry-planner/shared/core/sde"
)

// RunUnlockSdeVersion removes the SDE version lock so scheduled/manual updates can proceed.
func RunUnlockSdeVersion() error {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	backend, err := openSDEStore(ctx)
	if err != nil {
		return fmt.Errorf("sde store: %w", err)
	}

	lock, err := sdecore.ReadVersionLock(ctx, backend)
	if err != nil {
		return fmt.Errorf("failed reading current SDE version lock: %w", err)
	}
	if lock == nil {
		fmt.Printf("SDE version lock is already unlocked (backend=%s)\n", backend.Kind())
		return nil
	}

	if err := backend.Delete(ctx, sdecore.VersionLockObjectKey); err != nil {
		return fmt.Errorf("failed removing SDE version lock: %w", err)
	}

	out := map[string]interface{}{
		"backend":          backend.Kind(),
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
