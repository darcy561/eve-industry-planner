package process

import (
	"bufio"
	"fmt"
	"os"
	"strings"

	"golang.org/x/term"
)

// Confirm asks y/N on stderr when running interactively from a shell.
// Returns true when forced (yes), FromTUI (menu already chose the action),
// or the operator types y/yes. Non-TTY without yes → false.
func Confirm(prompt string, yes bool) bool {
	if yes || FromTUI() {
		return true
	}
	if !term.IsTerminal(int(os.Stdin.Fd())) {
		return false
	}
	fmt.Fprintf(os.Stderr, "%s [y/N] ", prompt)
	line, err := bufio.NewReader(os.Stdin).ReadString('\n')
	if err != nil {
		return false
	}
	switch strings.ToLower(strings.TrimSpace(line)) {
	case "y", "yes":
		return true
	default:
		return false
	}
}
