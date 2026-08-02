//go:build windows

package process

import (
	"bufio"
	"fmt"
	"os"
	"syscall"
	"unsafe"

	"golang.org/x/term"
)

var (
	kernel32                  = syscall.NewLazyDLL("kernel32.dll")
	procGetConsoleProcessList = kernel32.NewProc("GetConsoleProcessList")
)

// aloneOnConsole reports whether this process is the only one attached to the
// console (Explorer double-click). A shared shell (PowerShell, Windows Terminal,
// cmd) means the operator already has a lasting window.
func aloneOnConsole() bool {
	var pids [64]uint32
	n, _, _ := procGetConsoleProcessList.Call(
		uintptr(unsafe.Pointer(&pids[0])),
		uintptr(len(pids)),
	)
	return n == 1
}

// HoldOnError waits for Enter when this process is alone on the console, so a
// failure message is not lost when the window would otherwise close immediately.
// No-op for TUI children, shared shells, and non-TTY stdin.
func HoldOnError() {
	if FromTUI() {
		return
	}
	if !aloneOnConsole() {
		return
	}
	if !term.IsTerminal(int(os.Stdin.Fd())) {
		return
	}
	fmt.Fprint(os.Stderr, "Press Enter to close...")
	_, _ = bufio.NewReader(os.Stdin).ReadBytes('\n')
}
