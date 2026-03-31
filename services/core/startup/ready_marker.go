package startup

import (
	"fmt"
	"os"
	"path/filepath"
	"time"

	"eve-industry-planner/shared/shared/logs"
)

const defaultCoreReadyMarkerPath = "/data/core-ready"

// WriteCoreReadyMarker writes a marker file used by docker healthchecks.
// The api service can then safely wait for core's `service_healthy` state.
func WriteCoreReadyMarker() error {
	markerPath := os.Getenv("CORE_READY_MARKER_PATH")
	if markerPath == "" {
		markerPath = defaultCoreReadyMarkerPath
	}

	dir := filepath.Dir(markerPath)
	if dir != "." && dir != "" {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return fmt.Errorf("failed to create marker dir %q: %w", dir, err)
		}
	}

	contents := []byte(time.Now().UTC().Format(time.RFC3339Nano) + "\n")
	if err := os.WriteFile(markerPath, contents, 0o644); err != nil {
		return fmt.Errorf("failed writing core ready marker %q: %w", markerPath, err)
	}

	logs.Info("core marked ready", "marker_path", markerPath)
	return nil
}
