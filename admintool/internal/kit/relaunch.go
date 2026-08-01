package kit

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// RelaunchSelf starts a new process of this executable with args (empty = TUI),
// then exits the current process with code 0. Used after update-binary so the
// TUI picks up the replaced binary on disk.
func RelaunchSelf(args []string) error {
	exe, err := ResolvedExecutable()
	if err != nil {
		return fmt.Errorf("relaunch: %w", err)
	}
	if args == nil {
		args = []string{}
	}
	cmd := exec.Command(exe, args...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Stdin = os.Stdin
	cmd.Env = filterEnvKey(os.Environ(), "EIP_FROM_TUI")
	if home, err := Home(); err == nil {
		cmd.Dir = home
	}
	// Ensure we launch the on-disk path (post rename dance), not a stale name.
	if abs, err := filepath.Abs(exe); err == nil {
		cmd.Path = abs
	}
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("relaunch: start: %w", err)
	}
	os.Exit(0)
	return nil
}

func filterEnvKey(env []string, key string) []string {
	prefix := key + "="
	out := make([]string, 0, len(env))
	for _, e := range env {
		if strings.HasPrefix(e, prefix) {
			continue
		}
		out = append(out, e)
	}
	return out
}
