package yamldefaults

import (
	"fmt"
	"os"
	"path/filepath"

	"eve-industry-planner/admintool/internal/config"
	"eve-industry-planner/admintool/internal/kit"
)

// WriteMissing writes DefaultConfig() when home/eip.config.yaml is missing.
func WriteMissing(home string) (bool, error) {
	path := filepath.Join(home, kit.ConfigFile)
	if _, err := os.Stat(path); err == nil {
		return false, nil
	} else if !os.IsNotExist(err) {
		return false, err
	}
	if err := config.WriteYAML(path, DefaultConfig()); err != nil {
		return false, fmt.Errorf("write config: %w", err)
	}
	return true, nil
}
