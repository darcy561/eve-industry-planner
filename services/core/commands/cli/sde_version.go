package cli

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	sdeshared "eve-industry-planner/worker/tasks/sde/shared"
)

func sdeDataDir() string {
	if dataDir := strings.TrimSpace(os.Getenv("SDE_DATA_DIR")); dataDir != "" {
		return dataDir
	}
	return sdeshared.DefaultDataDir
}

// RunLiveVersionInfo prints current live SDE metadata to stdout.
func RunLiveVersionInfo() error {
	dataDir := sdeDataDir()
	version, err := sdeshared.ReadRootVersionJSON(dataDir)
	if err != nil {
		return fmt.Errorf("failed reading live SDE version from %q: %w", dataDir, err)
	}
	if version == nil {
		fmt.Printf("No live SDE version metadata found at %q\n", filepath.Join(dataDir, "version.json"))
		return nil
	}

	out := map[string]interface{}{
		"data_dir": dataDir,
		"live":     version,
	}
	b, err := json.MarshalIndent(out, "", "  ")
	if err != nil {
		return fmt.Errorf("failed formatting live version output: %w", err)
	}
	fmt.Println(string(b))
	return nil
}

type previousVersionInfo struct {
	Directory string                     `json:"directory"`
	Version   *sdeshared.StoredVersionJSON `json:"version,omitempty"`
}

// RunPreviousVersionsInfo prints retained previous SDE versions to stdout.
func RunPreviousVersionsInfo() error {
	dataDir := sdeDataDir()
	previousRoot := filepath.Join(dataDir, sdeshared.PreviousVersionsDirName)
	entries, err := os.ReadDir(previousRoot)
	if err != nil {
		if os.IsNotExist(err) {
			fmt.Printf("No previous versions directory found at %q\n", previousRoot)
			return nil
		}
		return fmt.Errorf("failed reading previous versions from %q: %w", previousRoot, err)
	}

	previous := make([]previousVersionInfo, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		dirName := entry.Name()
		versionPath := filepath.Join(previousRoot, dirName, "version.json")

		info := previousVersionInfo{Directory: dirName}
		b, readErr := os.ReadFile(versionPath)
		if readErr == nil {
			var parsed sdeshared.StoredVersionJSON
			if jsonErr := json.Unmarshal(b, &parsed); jsonErr == nil {
				info.Version = &parsed
			}
		}
		previous = append(previous, info)
	}

	sort.Slice(previous, func(i, j int) bool {
		vi := previous[i].Version
		vj := previous[j].Version
		if vi == nil && vj == nil {
			return previous[i].Directory < previous[j].Directory
		}
		if vi == nil {
			return false
		}
		if vj == nil {
			return true
		}
		if vi.GeneratedAt.Equal(vj.GeneratedAt) {
			return vi.BuildNumber > vj.BuildNumber
		}
		return vi.GeneratedAt.After(vj.GeneratedAt)
	})

	out := map[string]interface{}{
		"data_dir":           dataDir,
		"previous_versions":  previous,
		"retained_count":     len(previous),
		"previous_root_path": previousRoot,
	}
	b, err := json.MarshalIndent(out, "", "  ")
	if err != nil {
		return fmt.Errorf("failed formatting previous versions output: %w", err)
	}
	fmt.Println(string(b))
	return nil
}

