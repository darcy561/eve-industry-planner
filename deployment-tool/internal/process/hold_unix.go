//go:build unix

package process

import (
	"bufio"
	"fmt"
	"os"

	"golang.org/x/term"
)

// HoldOnError waits for Enter when this process looks desktop-launched and
// orphaned (reparented to PID 1) with a TTY — same intent as the Windows
// alone-on-console path. No-op for TUI children, normal shells, and non-TTY stdin.
func HoldOnError() {
	if FromTUI() {
		return
	}
	if os.Getppid() != 1 {
		return
	}
	if !term.IsTerminal(int(os.Stdin.Fd())) {
		return
	}
	fmt.Fprint(os.Stderr, "Press Enter to close...")
	_, _ = bufio.NewReader(os.Stdin).ReadBytes('\n')
}
