package kit

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

const writeProbeName = ".eip-write-probe"

// CheckDirWritable reports whether dir (or its nearest existing ancestor) allows
// creating files. Does not create missing directories (safe for live TUI checks).
func CheckDirWritable(dir string) error {
	dir = filepath.Clean(strings.TrimSpace(dir))
	if dir == "" || dir == "." {
		return fmt.Errorf("directory path is empty")
	}
	existing, err := nearestExistingDir(dir)
	if err != nil {
		return err
	}
	return probeDirWrite(existing)
}

// EnsureDirWritable creates dir if needed, then verifies files can be created there.
func EnsureDirWritable(dir string) error {
	dir = filepath.Clean(strings.TrimSpace(dir))
	if dir == "" || dir == "." {
		return fmt.Errorf("directory path is empty")
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return writableErr("cannot create directory", dir, err)
	}
	return probeDirWrite(dir)
}

// EnsureFileWritable ensures the parent directory exists and path can be written/replaced.
func EnsureFileWritable(path string) error {
	path = filepath.Clean(strings.TrimSpace(path))
	if path == "" || path == "." {
		return fmt.Errorf("file path is empty")
	}
	dir := filepath.Dir(path)
	if err := EnsureDirWritable(dir); err != nil {
		return err
	}
	if st, err := os.Stat(path); err == nil {
		if st.IsDir() {
			return fmt.Errorf("%s is a directory, not a file", path)
		}
		if err := probeFileWrite(path); err != nil {
			return writableErr("file not writable", path, err)
		}
		return nil
	} else if !errors.Is(err, fs.ErrNotExist) {
		return writableErr("cannot stat", path, err)
	}
	return nil
}

func nearestExistingDir(dir string) (string, error) {
	cur := filepath.Clean(dir)
	for {
		st, err := os.Stat(cur)
		if err == nil {
			if !st.IsDir() {
				return "", fmt.Errorf("%s is not a directory", cur)
			}
			return cur, nil
		}
		if !errors.Is(err, fs.ErrNotExist) {
			return "", writableErr("cannot stat", cur, err)
		}
		parent := filepath.Dir(cur)
		if parent == cur {
			return "", fmt.Errorf("no existing directory above %s", dir)
		}
		cur = parent
	}
}

func probeDirWrite(dir string) error {
	probe := filepath.Join(dir, writeProbeName)
	f, err := os.OpenFile(probe, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o600)
	if err != nil {
		return writableErr("directory not writable", dir, err)
	}
	_ = f.Close()
	if err := os.Remove(probe); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return writableErr("directory not writable", dir, err)
	}
	return nil
}

func probeFileWrite(path string) error {
	f, err := os.OpenFile(path, os.O_WRONLY, 0)
	if err != nil {
		return err
	}
	return f.Close()
}

func writableErr(prefix, path string, err error) error {
	if err == nil {
		return nil
	}
	if isPerm(err) {
		return fmt.Errorf("%s: %s (permission denied — pick a path you own or fix directory permissions)", prefix, path)
	}
	return fmt.Errorf("%s: %s (%v)", prefix, path, err)
}

func isPerm(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, fs.ErrPermission) || os.IsPermission(err) {
		return true
	}
	// Some platforms wrap EACCES without IsPermission on mkdir.
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "permission denied") || strings.Contains(msg, "access is denied")
}
