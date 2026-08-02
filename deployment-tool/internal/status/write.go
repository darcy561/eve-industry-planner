package status

import "fmt"

// ReportWriter receives one status report in document order.
// Implementations supply plain or styled OUTPUT.
type ReportWriter interface {
	Section(title string)
	Row(label, signal, detail, ports string)
	Task(text string, signal Signal)
}

// WriteReport walks Groups → Summary (Overall + Source) via w.
func WriteReport(r Report, w ReportWriter) {
	if w == nil {
		return
	}
	for _, g := range r.Groups {
		w.Section(g.Title)
		for _, row := range g.Rows {
			w.Row(row.Label, string(row.Signal), row.Detail, row.Ports)
			for _, t := range row.Tasks {
				w.Task(t, row.Signal)
			}
		}
	}
	w.Section("Summary")
	w.Row("Overall", string(r.Overall), r.OverallDetail, "")
	src, detail := SourceFields(r)
	w.Row("Source", src, detail, "")
}

// SourceFields returns the Summary Source column values.
func SourceFields(r Report) (source, detail string) {
	detail = "stack not deployed"
	if r.StackPresent {
		detail = fmt.Sprintf("stack %s deployed", r.StackName)
	}
	source = r.Source
	if source == "" {
		source = "unknown"
	}
	return source, detail
}
