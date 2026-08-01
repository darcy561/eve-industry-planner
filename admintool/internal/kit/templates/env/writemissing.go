package env

import (
	"os"
	"path/filepath"

	"eve-industry-planner/admintool/internal/kit"
)

// WriteMissing writes a registry-based .env when missing (skip backup on first create).
// Autogen fields are resolved to real secrets — never writes auto-generate-me.
func WriteMissing(home string) (bool, error) {
	path := filepath.Join(home, kit.EnvFile)
	if _, err := os.Stat(path); err == nil {
		return false, nil
	} else if !os.IsNotExist(err) {
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
