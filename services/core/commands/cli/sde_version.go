package cli

import (
	"context"
	"encoding/json"
	sdecore "eve-industry-planner/shared/core/sde"
	"fmt"
	"sort"
	"strings"
	"time"

	objectstore "eve-industry-planner/shared/core/objectstore"
)

func openSDEStore(ctx context.Context) (objectstore.Backend, error) {
	return objectstore.OpenStaticData(ctx)
}

// RunSdeVersion prints current live SDE metadata to stdout.
func RunSdeVersion() error {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	backend, err := openSDEStore(ctx)
	if err != nil {
		return fmt.Errorf("sde store: %w", err)
	}
	version, err := sdecore.ReadRootVersionJSON(ctx, backend)
	if err != nil {
		return fmt.Errorf("failed reading live SDE version: %w", err)
	}
	if version == nil {
		fmt.Printf("No live SDE version metadata found (backend=%s)\n", backend.Kind())
		return nil
	}

	out := map[string]interface{}{
		"backend": backend.Kind(),
		"live":    version,
	}
	b, err := json.MarshalIndent(out, "", "  ")
	if err != nil {
		return fmt.Errorf("failed formatting live version output: %w", err)
	}
	fmt.Println(string(b))
	return nil
}

type previousVersionInfo struct {
	Directory string               `json:"directory"`
	Version   *sdecore.VersionJSON `json:"version,omitempty"`
}

// RunSdeVersionHistory prints retained previous SDE versions to stdout.
func RunSdeVersionHistory() error {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	backend, err := openSDEStore(ctx)
	if err != nil {
		return fmt.Errorf("sde store: %w", err)
	}
	names, err := backend.ListChildNames(ctx, sdecore.PreviousVersionsPrefix)
	if err != nil {
		return fmt.Errorf("failed listing previous versions: %w", err)
	}
	if len(names) == 0 {
		fmt.Printf("No previous versions found (backend=%s)\n", backend.Kind())
		return nil
	}

	previous := make([]previousVersionInfo, 0, len(names))
	for _, dirName := range names {
		if dirName == "" || strings.HasPrefix(dirName, ".") {
			continue
		}
		info := previousVersionInfo{Directory: dirName}
		if data, err := backend.Get(ctx, sdecore.PreviousVersionKey(dirName, sdecore.VersionObjectKey)); err == nil {
			var parsed sdecore.VersionJSON
			if json.Unmarshal(data, &parsed) == nil {
				info.Version = &parsed
			}
		}
		previous = append(previous, info)
	}

	sort.Slice(previous, func(i, j int) bool {
		return previous[i].Directory > previous[j].Directory
	})

	out := map[string]interface{}{
		"backend":           backend.Kind(),
		"previous_versions": previous,
	}
	b, err := json.MarshalIndent(out, "", "  ")
	if err != nil {
		return fmt.Errorf("failed formatting history output: %w", err)
	}
	fmt.Println(string(b))
	return nil
}
