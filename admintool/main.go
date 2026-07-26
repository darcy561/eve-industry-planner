// Command eip: Eve Industry Planner deployment management (TUI-first + CLI).
package main

import (
	"fmt"
	"os"

	"eve-industry-planner/admintool/cmd"
	"eve-industry-planner/admintool/internal/process"
	"eve-industry-planner/admintool/tui"
)

func main() {
	args := os.Args[1:]
	forceUI := len(args) == 1 && (args[0] == "ui" || args[0] == "tui")

	// TUI-first when interactive + no args. Child of TUI → CLI only.
	if forceUI || (len(args) == 0 && !process.FromTUI() && process.Interactive()) {
		if err := tui.Run(); err != nil {
			fmt.Fprintf(os.Stderr, "\neip tui exited: %v\n", err)
			process.HoldOnError()
			os.Exit(1)
		}
		return
	}

	if err := cmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		process.HoldOnError()
		os.Exit(1)
	}
}
