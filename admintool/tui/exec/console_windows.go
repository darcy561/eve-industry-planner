//go:build windows

package exec

import (
	"fmt"
	"os"
	osexec "os/exec"

	"eve-industry-planner/admintool/internal/kit"
)

// StartInNewConsole launches eip <args> in a new console via `cmd /c start`.
// CREATE_NEW_CONSOLE alone inherits the TUI's stdio, so the new window stays blank.
// `start` allocates a real console for the child. Strips EIP_FROM_TUI so the
// child can run its own alt-screen UI (e.g. logs -f --ui).
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

	// start "title" /D home exe arg1 arg2...
	startArgs := []string{"/c", "start", "EIP logs"}
	if home != "" {
		startArgs = append(startArgs, "/D", home)
	}
	startArgs = append(startArgs, exe)
	startArgs = append(startArgs, args...)

	cmd := osexec.Command("cmd.exe", startArgs...)
	cmd.Env = os.Environ() // strip nothing; child must not get EIP_FROM_TUI from TUI
	// Ensure TUI's EIP_FROM_TUI is not inherited.
	cmd.Env = filterEnv(cmd.Env, "EIP_FROM_TUI")
	if home != "" {
		cmd.Dir = home
	}
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("start new console: %w", err)
	}
	return nil
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
