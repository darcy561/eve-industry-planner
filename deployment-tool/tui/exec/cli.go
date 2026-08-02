// Package exec runs child `eip <args>` for the TUI (never Cobra/Docker in-process).
//
// Streaming: EIPMSG on stdout → EventMsg / pane.* / output/<cmd>.Msg;
// stderr → pane as errors. Non-protocol stdout discarded under TUI.
package exec

func normalizeArgs(args []string) []string {
	if len(args) > 0 && (args[0] == "eip" || args[0] == "eip.exe") {
		return args[1:]
	}
	return args
}
