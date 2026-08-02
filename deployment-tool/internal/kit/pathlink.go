package kit

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

// LinkName is the basename of the PATH shim (eip / eip.exe).
func LinkName() string {
	if runtime.GOOS == "windows" {
		return "eip.exe"
	}
	return "eip"
}

// DefaultLinkDir picks a directory for an optional PATH symlink.
// Prefer a user-writable bin dir; on Unix also try /usr/local/bin when writable.
func DefaultLinkDir() (string, error) {
	for _, dir := range linkDirCandidates() {
		if linkDirUsable(dir) {
			return dir, nil
		}
	}
	return "", fmt.Errorf("no writable link directory (tried: %s)", strings.Join(linkDirCandidates(), ", "))
}

func linkDirCandidates() []string {
	home, _ := os.UserHomeDir()
	var out []string
	if runtime.GOOS != "windows" {
		out = append(out, "/usr/local/bin")
	}
	if home != "" {
		if runtime.GOOS == "windows" {
			if local := os.Getenv("LOCALAPPDATA"); local != "" {
				out = append(out, filepath.Join(local, "eip", "bin"))
			}
			out = append(out, filepath.Join(home, "bin"))
		} else {
			out = append(out, filepath.Join(home, ".local", "bin"), filepath.Join(home, "bin"))
		}
	}
	return out
}

func linkDirUsable(dir string) bool {
	if dir == "" {
		return false
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return false
	}
	probe := filepath.Join(dir, ".eip-link-write-test")
	if err := os.WriteFile(probe, []byte("ok"), 0o644); err != nil {
		return false
	}
	_ = os.Remove(probe)
	return true
}

// ResolvedExecutable returns the absolute path of this binary (symlinks evaluated).
func ResolvedExecutable() (string, error) {
	exe, err := os.Executable()
	if err != nil {
		return "", err
	}
	if resolved, err := filepath.EvalSymlinks(exe); err == nil {
		exe = resolved
	}
	return filepath.Abs(exe)
}

// InstallPathLink creates a symlink named LinkName() in dir pointing at this binary.
// If a symlink already points here, it is a no-op success. Refuses to overwrite a
// non-symlink file.
func InstallPathLink(dir string) (linkPath string, err error) {
	if dir == "" {
		dir, err = DefaultLinkDir()
		if err != nil {
			return "", err
		}
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", fmt.Errorf("link dir: %w", err)
	}
	target, err := ResolvedExecutable()
	if err != nil {
		return "", err
	}
	linkPath = filepath.Join(dir, LinkName())
	if fi, err := os.Lstat(linkPath); err == nil {
		if fi.Mode()&os.ModeSymlink == 0 {
			return "", fmt.Errorf("%s exists and is not a symlink — remove it or choose --dir", linkPath)
		}
		cur, err := os.Readlink(linkPath)
		if err != nil {
			return "", err
		}
		if !filepath.IsAbs(cur) {
			cur = filepath.Join(dir, cur)
		}
		if abs, err := filepath.Abs(cur); err == nil {
			cur = abs
		}
		if sameFilePath(cur, target) {
			return linkPath, nil
		}
		if err := os.Remove(linkPath); err != nil {
			return "", fmt.Errorf("replace symlink: %w", err)
		}
	} else if !errors.Is(err, fs.ErrNotExist) {
		return "", err
	}
	if err := os.Symlink(target, linkPath); err != nil {
		return "", fmt.Errorf("symlink %s → %s: %w\n(on Windows enable Developer Mode or run an elevated shell)", linkPath, target, err)
	}
	return linkPath, nil
}

// RemovePathLink removes the symlink in dir when it points at this binary.
func RemovePathLink(dir string) (linkPath string, err error) {
	if dir == "" {
		dir, err = DefaultLinkDir()
		if err != nil {
			return "", err
		}
	}
	linkPath = filepath.Join(dir, LinkName())
	fi, err := os.Lstat(linkPath)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return linkPath, fmt.Errorf("no link at %s", linkPath)
		}
		return "", err
	}
	if fi.Mode()&os.ModeSymlink == 0 {
		return "", fmt.Errorf("%s is not a symlink — not removing", linkPath)
	}
	cur, err := os.Readlink(linkPath)
	if err != nil {
		return "", err
	}
	if !filepath.IsAbs(cur) {
		cur = filepath.Join(dir, cur)
	}
	target, err := ResolvedExecutable()
	if err != nil {
		return "", err
	}
	if abs, err := filepath.Abs(cur); err == nil {
		cur = abs
	}
	if !sameFilePath(cur, target) {
		return "", fmt.Errorf("%s points at %s, not this binary (%s) — not removing", linkPath, cur, target)
	}
	if err := os.Remove(linkPath); err != nil {
		return "", err
	}
	return linkPath, nil
}

// DirOnPATH reports whether dir appears in PATH (exact path element match).
func DirOnPATH(dir string) bool {
	abs, err := filepath.Abs(dir)
	if err != nil {
		return false
	}
	for _, p := range filepath.SplitList(os.Getenv("PATH")) {
		if p == "" {
			continue
		}
		pa, err := filepath.Abs(p)
		if err != nil {
			continue
		}
		if sameFilePath(pa, abs) {
			return true
		}
	}
	return false
}

func sameFilePath(a, b string) bool {
	a = filepath.Clean(a)
	b = filepath.Clean(b)
	if runtime.GOOS == "windows" {
		return strings.EqualFold(a, b)
	}
	return a == b
}
