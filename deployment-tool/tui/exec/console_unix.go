//go:build !windows

package exec

import (
	"fmt"
	"os"
	osexec "os/exec"

	"eve-industry-planner/deployment-tool/internal/kit"
)

// StartInNewConsole launches eip <args> in an external terminal when possible.
func StartInNewConsole(args []string) error {
	args = normalizeArgs(args)
	if len(args) == 0 {
		return fmt.Errorf("no command given")
	}
	exe, err := os.Executable()
	if err != nil {
		return fmt.Errorf("resolve eip binary: %w", err)
	}
	home := ""
	if h, err := kit.Home(); err == nil {
		home = h
	}

	cmdArgs := append([]string{exe}, args...)
	candidates := [][]string{
		{"x-terminal-emulator", "-e"},
		{"gnome-terminal", "--"},
		{"konsole", "-e"},
		{"xterm", "-e"},
	}
	if term := os.Getenv("TERMINAL"); term != "" {
		candidates = append([][]string{{term, "-e"}}, candidates...)
	}
	for _, c := range candidates {
		bin := c[0]
		if _, err := osexec.LookPath(bin); err != nil {
			continue
		}
		full := append(append([]string{}, c[1:]...), cmdArgs...)
		cmd := osexec.Command(bin, full...)
		cmd.Env = filterEnv(os.Environ(), "EIP_FROM_TUI")
		if home != "" {
			cmd.Dir = home
		}
		if err := cmd.Start(); err != nil {
			continue
		}
		_ = cmd.Process.Release()
		return nil
	}
	return fmt.Errorf("follow: no terminal found — run: eip %v", args)
}

func filterEnv(env []string, dropKey string) []string {
	prefix := dropKey + "="
	out := make([]string, 0, len(env))
	for _, e := range env {
		if len(e) >= len(prefix) && e[:len(prefix)] == prefix {
			continue
		}
		out = append(out, e)
	}
	return out
}
