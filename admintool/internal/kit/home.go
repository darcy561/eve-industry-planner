// Home is always the process working directory — the folder that owns
// stack YAML, .env, mode markers, and (in public installs) eip itself.
// Public: setup drops the kit into one folder; run eip from there.
// Local: run from the repo root.
package kit

import (
	"os"
	"path/filepath"
)

// Home returns the absolute project home (process working directory).
func Home() (string, error) {
	wd, err := os.Getwd()
	if err != nil {
		return "", err
	}
	return filepath.Abs(wd)
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
