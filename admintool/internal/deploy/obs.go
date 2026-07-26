package deploy

import (
	"fmt"
	"os"
	"path/filepath"

	"eve-industry-planner/admintool/internal/kit"
)

// requireObsStack fails when observability is enabled but the obs stack file is missing.
func requireObsStack(home string, enabled bool) error {
	if !enabled {
		return nil
	}
	if _, err := os.Stat(filepath.Join(home, kit.ObsStackFile)); err != nil {
		return fmt.Errorf("addons.observability.enabled but missing %s", kit.ObsStackFile)
	}
	return nil
}
