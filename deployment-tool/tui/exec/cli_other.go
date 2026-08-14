//go:build !windows

package exec

import "os/exec"

func detachChild(cmd *exec.Cmd) {
	// Unix: nil stdin + pipes is enough; no console-attach issues.
}
