// WriteMissing* writes embedded starter files for eip init.
package kit

import (
	_ "embed"
	"fmt"
	"os"
	"path/filepath"
)

//go:embed templates/env.example
var envExample []byte

//go:embed templates/eip.config.yaml
var configExample []byte

// WriteMissingEnv writes the embedded env template to home/.env when missing.
func WriteMissingEnv(home string) (bool, error) {
	return writeMissing(filepath.Join(home, EnvFile), envExample)
}

// WriteMissingConfig writes the embedded config template to home/eip.config.yaml when missing.
func WriteMissingConfig(home string) (bool, error) {
	return writeMissing(filepath.Join(home, ConfigFile), configExample)
}

func writeMissing(path string, raw []byte) (bool, error) {
	if _, err := os.Stat(path); err == nil {
		return false, nil
	} else if !os.IsNotExist(err) {
		return false, err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return false, err
	}
	if err := os.WriteFile(path, raw, 0o600); err != nil {
		return false, fmt.Errorf("write %s: %w", path, err)
	}
	return true, nil
}
