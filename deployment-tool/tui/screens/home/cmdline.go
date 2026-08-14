package home

import (
	"strings"

	"eve-industry-planner/deployment-tool/internal/catalog"
)

// cmdLineAction is one parsed line from the combined Command window.
type cmdLineAction struct {
	// RunArgs is child eip argv (e.g. status, or cli list). Empty when Builder set or Err set.
	RunArgs []string
	Label   string // pane label for startCLI
	// Builder is setup | secrets | settings when a form should open instead.
	Builder string
	// Err is a user-facing message (stay in session; do not run).
	Err string
}

// parseCommandLine routes host eip verbs and core-container tasks.
//
//	status / init / secrets / sync … → eip <verb>…   (host; init = headless file gen)
//	cli list / tasks list            → eip cli …     (core tasks; tasks prefix stripped)
//	list / sdeVersion …              → eip cli …     (unknown host verb → core)
//	setup / edit / settings          → builders (menu Setup/Secrets/Settings is preferred)
//	shell / bare cli                 → error (TTY shell only outside TUI)
func parseCommandLine(line string) cmdLineAction {
	args := strings.Fields(strings.TrimSpace(line))
	if len(args) == 0 {
		return cmdLineAction{}
	}
	switch args[0] {
	case "setup":
		// Alias only — guided Setup is Main → Setup; init runs host eip init.
		return cmdLineAction{Builder: "setup"}
	case "edit", "edit-env", "env":
		return cmdLineAction{Builder: "secrets"}
	case "edit-config", "config", "settings":
		return cmdLineAction{Builder: "settings"}
	case "shell":
		return cmdLineAction{Err: "Interactive core shell needs a terminal — run: eip cli"}
	case "cli":
		if len(args) == 1 {
			return cmdLineAction{Err: "Interactive core shell needs a terminal — run: eip cli"}
		}
		return cmdLineAction{RunArgs: args, Label: strings.Join(args, " ")}
	case "tasks":
		// Same as cli … (container wrapper adds tasks).
		rest := args[1:]
		if len(rest) == 0 {
			return cmdLineAction{Err: "Usage: tasks <subcommand>   or   cli <subcommand>"}
		}
		run := append([]string{"cli"}, rest...)
		return cmdLineAction{RunArgs: run, Label: strings.Join(run, " ")}
	default:
		if _, ok := catalog.ByID(args[0]); ok {
			return cmdLineAction{RunArgs: args, Label: strings.Join(args, " ")}
		}
		// Not a host verb — treat as core tasks subcommand (list, sdeVersion, …).
		run := append([]string{"cli"}, args...)
		return cmdLineAction{RunArgs: run, Label: strings.Join(run, " ")}
	}
}
