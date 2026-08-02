package kit

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// RelaunchOpts configures RelaunchSelfOpts.
type RelaunchOpts struct {
	// ExtraEnv are KEY=value pairs merged into the new process env (override).
	ExtraEnv []string
}

// RelaunchSelfOpts starts a new process of this executable with args (empty = TUI),
// then exits the current process with code 0. Used after eip update so the
// TUI picks up the replaced binary on disk. ExtraEnv overrides are optional.
func RelaunchSelfOpts(args []string, opts RelaunchOpts) error {
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
	cmd.Env = mergeRelaunchEnv(os.Environ(), opts)
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

// RunSelf runs this executable with args, waits, and returns the exit error.
// Used by CLI `eip update` after a binary install so stacks/images run in the
// new process while the parent shell still waits.
func RunSelf(args []string) error {
	exe, err := ResolvedExecutable()
	if err != nil {
		return fmt.Errorf("runself: %w", err)
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
	if abs, err := filepath.Abs(exe); err == nil {
		cmd.Path = abs
	}
	return cmd.Run()
}

// mergeRelaunchEnv strips EIP_FROM_TUI and applies ExtraEnv overrides.
func mergeRelaunchEnv(environ []string, opts RelaunchOpts) []string {
	env := filterEnvKey(environ, "EIP_FROM_TUI")
	for _, kv := range opts.ExtraEnv {
		key, _, _ := strings.Cut(kv, "=")
		if key != "" {
			env = filterEnvKey(env, key)
		}
		env = append(env, kv)
	}
	return env
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
