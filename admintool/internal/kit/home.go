// Home is the directory that contains the running eip / eip.exe binary.
// Bootstrap installs the binary into the deploy folder; stack YAML, .env, and
// config live beside it. Everything in the tool resolves paths from that folder.
package kit

import (
	"os"
	"path/filepath"
)

// Home returns the absolute project home (directory of this executable).
func Home() (string, error) {
	exe, err := os.Executable()
	if err != nil {
		return "", err
	}
	if resolved, err := filepath.EvalSymlinks(exe); err == nil {
		exe = resolved
	}
	return filepath.Abs(filepath.Dir(exe))
}

// Path joins elements under Home (fails if Home cannot be resolved).
func Path(elem ...string) (string, error) {
	home, err := Home()
	if err != nil {
		return "", err
	}
	parts := append([]string{home}, elem...)
	return filepath.Join(parts...), nil
}
