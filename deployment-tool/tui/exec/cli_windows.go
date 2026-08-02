//go:build windows

package exec

import (
	"os/exec"
	"syscall"
)

// detachChild keeps the child off the TUI console so its lifetime cannot
// take down the parent UI when the command finishes.
func detachChild(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow:    true,
		CreationFlags: 0x08000000, // CREATE_NO_WINDOW
	}
}
