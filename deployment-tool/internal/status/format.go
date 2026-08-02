package status

import (
	"strings"
)

// FormatPlain renders a plain-text status dump for standalone CLI (stdout).
// No ANSI — TUI styling lives in tui/output/status.
func FormatPlain(r Report) string {
	var b strings.Builder
	WriteReport(r, &plainWriter{&b})
	return b.String()
}

type plainWriter struct {
	b *strings.Builder
}

func (w *plainWriter) Section(title string) {
	w.b.WriteString(Section(title))
	w.b.WriteByte('\n')
}

func (w *plainWriter) Row(label, signal, detail, ports string) {
	w.b.WriteString(PlainRow(label, signal, detail, ports))
	w.b.WriteByte('\n')
}

func (w *plainWriter) Task(text string, _ Signal) {
	w.b.WriteString(TaskLine(text))
	w.b.WriteByte('\n')
}
