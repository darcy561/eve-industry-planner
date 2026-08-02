// Shared terminal OUTPUT layout (column widths, section headings, row/task lines).
// Styling stays in CLI (plain) or TUI (lipgloss).
package status

import "fmt"

// Column widths shared by CLI FormatPlain and TUI command renderers.
const (
	LabelWidth  = 26
	SignalWidth = 10
	DetailWidth = 22
)

// Section returns a section heading: "── Title ──".
func Section(title string) string {
	return "── " + title + " ──"
}

// RowParts pads label / signal / detail(+ports) to the shared column widths.
func RowParts(label, signal, detail, ports string) (lab, sig, rest string) {
	lab = fmt.Sprintf("%-*s", LabelWidth, label)
	sig = fmt.Sprintf("%-*s", SignalWidth, signal)
	rest = detail
	if ports != "" {
		rest = fmt.Sprintf("%-*s ports %s", DetailWidth, detail, ports)
	}
	return lab, sig, rest
}

// PlainRow is one indented status row with no ANSI.
func PlainRow(label, signal, detail, ports string) string {
	lab, sig, rest := RowParts(label, signal, detail, ports)
	return "  " + lab + " " + sig + " " + rest
}

// TaskLine is one indented task/detail bullet.
func TaskLine(text string) string {
	return "      - " + text
}
