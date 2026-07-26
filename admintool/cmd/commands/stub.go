package commands

import (
	"fmt"

	"eve-industry-planner/admintool/internal/msg"
)

// stubNotImplemented emits StatusMsg under TUI, then returns a stub error.
// CLI/main print the error on stderr; under TUI that line feeds the OUTPUT pane.
func stubNotImplemented(verb string) error {
	outMsg := fmt.Sprintf("eip %s: not implemented yet", verb)
	msg.EmitStackForVerb(verb)
	return fmt.Errorf("%s", outMsg)
}
