package yamldefaults

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"

	"eve-industry-planner/deployment-tool/internal/config"
	"eve-industry-planner/deployment-tool/internal/kit"
)

// WriteMissing writes DefaultConfig() when home/eip.config.yaml is missing.
func WriteMissing(home string) (bool, error) {
	path := filepath.Join(home, kit.ConfigFile)
	if _, err := os.Stat(path); err == nil {
		return false, nil
	} else if !errors.Is(err, fs.ErrNotExist) {
		return false, err
	}
	if err := config.WriteYAML(path, DefaultConfig()); err != nil {
		return false, fmt.Errorf("write config: %w", err)
	}
	return true, nil
}
