package env

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"

	"eve-industry-planner/deployment-tool/internal/kit"
)

// WriteMissing writes a registry-based .env when missing (skip backup on first create).
// Autogen fields are resolved to real secrets on write.
func WriteMissing(home string) (bool, error) {
	path := filepath.Join(home, kit.EnvFile)
	if _, err := os.Stat(path); err == nil {
		return false, nil
	} else if !errors.Is(err, fs.ErrNotExist) {
		return false, err
	}
	vals := DefaultEnvValues()
	// nil generate map → defaultGenerateFlag (required Autogen empty → generate; optional empty stays empty).
	resolved, err := ResolveEnvFields(vals, nil)
	if err != nil {
		return false, err
	}
	if err := EmitEnvOpts(path, resolved, EmitOpts{SkipBackup: true}); err != nil {
		return false, err
	}
	return true, nil
}
