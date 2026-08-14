package process

import (
	"os"

	"golang.org/x/term"
)

// Interactive reports whether stdin/stdout are terminals (safe for TUI).
func Interactive() bool {
	return term.IsTerminal(int(os.Stdin.Fd())) && term.IsTerminal(int(os.Stdout.Fd()))
}
