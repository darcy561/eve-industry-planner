package startup

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	natscore "eve-industry-planner/shared/core/nats"
	sdecore "eve-industry-planner/shared/core/sde"
	"eve-industry-planner/shared/shared"
	"eve-industry-planner/shared/logs"
	taskscore "eve-industry-planner/shared/tasks"
)

type sdeVersionFileShape struct {
	BuildNumber int    `json:"build_number"`
	Version     string `json:"version"`
}

func requiredSDEPaths(dataDir string) []string {
	return sdecore.RequiredOutputPaths(dataDir)
}

func isNonEmptyFile(path string) bool {
	info, err := os.Stat(path)
	if err != nil {
		return false
	}
	return info.Size() > 0
}

func validateSDEVersionFile(path string) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}

	var v sdeVersionFileShape
	if err := json.Unmarshal(data, &v); err != nil {
		return fmt.Errorf("invalid version.json: %w", err)
	}
	if v.BuildNumber <= 0 {
		// Treat missing/zero as invalid to avoid "stale" marker situations.
		return fmt.Errorf("version.json has invalid build_number=%d", v.BuildNumber)
	}
	return nil
}

// CheckSDEStaticDataReady validates the files required by the worker's SDE pipeline.
// It returns true when everything exists and is non-empty, otherwise it returns false + missing/invalid list.
func CheckSDEStaticDataReady(dataDir string) (bool, []string) {
	paths := requiredSDEPaths(dataDir)
	invalid := make([]string, 0)

	// version.json needs extra validation to ensure it's not an empty/stale file.
	versionPath := filepath.Join(dataDir, sdecore.VersionFileName)
	if err := validateSDEVersionFile(versionPath); err != nil {
		invalid = append(invalid, fmt.Sprintf("invalid %s (%v)", versionPath, err))
	}

	// Other output files only need to be present and non-empty.
	for _, p := range paths {
		if p == versionPath {
			continue
		}
		if !isNonEmptyFile(p) {
			invalid = append(invalid, fmt.Sprintf("missing/empty %s", p))
		}
	}

	return len(invalid) == 0, invalid
}

func triggerCheckSDEUpdates(ctx context.Context, clients *shared.ServiceClients) error {
	if clients == nil || clients.JetStream == nil {
		return fmt.Errorf("nats jetstream is not available")
	}

	// Ensure the stream exists before publishing.
	if err := natscore.EnsureWorkerTaskStream(clients.JetStream); err != nil {
		return fmt.Errorf("failed to ensure worker task stream: %w", err)
	}

	// Publish the task to the worker. The worker will persist output into /static-data.
	task := taskscore.CheckSDEUpdates
	if err := natscore.PublishTask(ctx, clients.JetStream, task.Subject, task.Name, nil, clients.NATS); err != nil {
		return fmt.Errorf("failed to publish %q task: %w", task.Name, err)
	}

	logs.InfoCtx(ctx, "triggered SDE update check task", "task", task.Name)
	return nil
}

// EnsureSDEStaticDataReady blocks until the SDE/static-data files exist.
// If files are missing, it triggers the worker's `checkSDEUpdates` task and polls until ready or timeout.
func EnsureSDEStaticDataReady(ctx context.Context, clients *shared.ServiceClients) error {
	dataDir := os.Getenv("SDE_DATA_DIR")
	if dataDir == "" {
		dataDir = sdecore.DefaultDataDir
	}

	// SDE generation/persistence should complete quickly on typical deployments.
	// Default to 2 minutes to avoid blocking the API unnecessarily.
	timeout := 2 * time.Minute
	if v := os.Getenv("CORE_STATIC_DATA_STARTUP_TIMEOUT"); v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			timeout = d
		}
	}

	pollInterval := 5 * time.Second
	if v := os.Getenv("CORE_STATIC_DATA_STARTUP_POLL_INTERVAL"); v != "" {
		if d, err := time.ParseDuration(v); err == nil && d > 0 {
			pollInterval = d
		}
	}

	ready, invalid := CheckSDEStaticDataReady(dataDir)
	if ready {
		logs.InfoCtx(ctx, "SDE static-data already ready", "data_dir", dataDir)
		return nil
	}

	logs.WarnCtx(ctx,
		"SDE static-data not ready; will trigger worker task and wait",
		"data_dir", dataDir,
		"missing_or_invalid", len(invalid),
	)
	for i := 0; i < len(invalid) && i < 5; i++ {
		logs.WarnCtx(ctx, "SDE static-data issue", "detail", invalid[i])
	}

	if err := triggerCheckSDEUpdates(ctx, clients); err != nil {
		return err
	}

	waitCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	ticker := time.NewTicker(pollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-waitCtx.Done():
			ready, invalid := CheckSDEStaticDataReady(dataDir)
			if ready {
				return nil
			}
			return fmt.Errorf("timed out waiting for SDE static-data readiness after %s. Issues: %v", timeout, invalid)
		case <-ticker.C:
			ready, invalid = CheckSDEStaticDataReady(dataDir)
			if ready {
				logs.InfoCtx(waitCtx, "SDE static-data became ready", "data_dir", dataDir)
				return nil
			}

			// Keep logs low-volume; most useful info was already printed before triggering.
			_ = invalid
		}
	}
}
