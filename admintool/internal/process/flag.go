// Package process is OS-process helpers for the eip binary: child-of-TUI flags,
// desktop-launch exit hold, and other process-scoped behaviour shared by CLI and TUI.
//
// Process flags are not .env keys — see docs/admintool/VARIABLES.md.
package process

import "os"

// EnvFromTUI is set to ValueTrue on every TUI-launched child.
// App-wide: skip nested TUI, allow EIPMSG emit, and other child-of-TUI behaviour.
const (
	EnvFromTUI = "EIP_FROM_TUI"
	ValueTrue  = "1"
)

// FromTUI reports whether this process was launched by the TUI.
func FromTUI() bool {
	return os.Getenv(EnvFromTUI) == ValueTrue
}

// ChildEnv is the KEY=value pair to append to a child's Cmd.Env.
func ChildEnv() string {
	return EnvFromTUI + "=" + ValueTrue
}
