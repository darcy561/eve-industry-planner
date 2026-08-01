// Command eip: Eve Industry Planner deployment management (TUI-first + CLI).
package main

import (
	"fmt"
	"os"

	"eve-industry-planner/admintool/cmd"
	"eve-industry-planner/admintool/internal/process"
	"eve-industry-planner/admintool/tui"
	tuiexec "eve-industry-planner/admintool/tui/exec"
)

func main() {
	args := os.Args[1:]
	forceUI := len(args) == 1 && (args[0] == "ui" || args[0] == "tui")
	wantTUI := forceUI || (len(args) == 0 && !process.FromTUI())

	// TUI-first when interactive + no args (or eip ui). Child of TUI → CLI only.
	// No TTY (Linux file-manager / some IDE runners): open an external terminal
	// when possible — Windows double-click already gets a console.
	if wantTUI {
		if process.Interactive() {
			if err := tui.Run(); err != nil {
				fmt.Fprintf(os.Stderr, "\neip tui exited: %v\n", err)
				process.HoldOnError()
				os.Exit(1)
			}
			return
		}
		if err := tuiexec.StartInNewConsole([]string{"ui"}); err == nil {
			return
		} else if forceUI {
			fmt.Fprintf(os.Stderr, "eip ui needs a terminal (stdin/stdout TTY).\n")
			fmt.Fprintf(os.Stderr, "Run from a shell: ./eip   or   ./eip ui\n")
			fmt.Fprintf(os.Stderr, "(%v)\n", err)
			process.HoldOnError()
			os.Exit(1)
		}
		// no args + no TTY + no GUI terminal → fall through to CLI help (scripts / CI)
	}

	if err := cmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		process.HoldOnError()
		os.Exit(1)
	}
}
