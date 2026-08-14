// Project home is the directory of the running eip binary (stack YAML, .env,
// config sit beside it). go test / go run use a temp binary, so those fall back
// to the process working directory.
package kit

import (
	"os"
	"path/filepath"
	"strings"
)

// Home returns the absolute project home.
func Home() (string, error) {
	exe, err := os.Executable()
	if err != nil {
		return wdAbs()
	}
	return homeFromExecutable(exe)
}

// Path joins path elements under Home.
func Path(elem ...string) (string, error) {
	home, err := Home()
	if err != nil {
		return "", err
	}
	parts := append([]string{home}, elem...)
	return filepath.Join(parts...), nil
}

func homeFromExecutable(exe string) (string, error) {
	if resolved, err := filepath.EvalSymlinks(exe); err == nil {
		exe = resolved
	}
	if goToolEphemeralExe(exe) {
		return wdAbs()
	}
	return filepath.Abs(filepath.Dir(exe))
}

func wdAbs() (string, error) {
	wd, err := os.Getwd()
	if err != nil {
		return "", err
	}
	return filepath.Abs(wd)
}

// goToolEphemeralExe is true for go test / go run binaries (go-build or *.test).
func goToolEphemeralExe(exe string) bool {
	slash := filepath.ToSlash(exe)
	if strings.Contains(slash, "/go-build") {
		return true
	}
	base := filepath.Base(exe)
	return strings.HasSuffix(base, ".test") || strings.HasSuffix(base, ".test.exe")
}
