// Package process is OS-process helpers for the Deployment Tool CLI binary: child-of-TUI flags,
// desktop-launch exit hold, and other process-scoped behaviour shared by CLI and TUI.
//
// Process flags are not .env keys — see technical-documentation/deployment/deployment-tool/cli/variables.md.
package process

import "os"

// EnvFromTUI is set to ValueTrue on every TUI-launched child.
// App-wide: skip nested TUI, allow EIPMSG emit, and other child-of-TUI behaviour.
//
// EnvUpdateResume is set on TUI relaunch after a binary install so the new TUI
// auto-runs `eip update` again (stacks/images). Cleared on read.
const (
	EnvFromTUI      = "EIP_FROM_TUI"
	EnvUpdateResume = "EIP_UPDATE_RESUME"
	ValueTrue       = "1"
)

// FromTUI reports whether this process was launched by the TUI.
func FromTUI() bool {
	return os.Getenv(EnvFromTUI) == ValueTrue
}

// TakeUpdateResume reports whether EIP_UPDATE_RESUME was set and clears it.
func TakeUpdateResume() bool {
	if os.Getenv(EnvUpdateResume) != ValueTrue {
		return false
	}
	_ = os.Unsetenv(EnvUpdateResume)
	return true
}

// ChildEnv is the KEY=value pair to append to a child's Cmd.Env.
func ChildEnv() string {
	return EnvFromTUI + "=" + ValueTrue
}

// UpdateResumeEnv is the KEY=value pair for TUI relaunch after binary install.
func UpdateResumeEnv() string {
	return EnvUpdateResume + "=" + ValueTrue
}
