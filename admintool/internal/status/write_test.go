package status

import "testing"

func TestSourceFields(t *testing.T) {
	src, detail := SourceFields(Report{StackPresent: false, Source: ""})
	if src != "unknown" || detail != "stack not deployed" {
		t.Fatalf("%q %q", src, detail)
	}
	src, detail = SourceFields(Report{StackPresent: true, StackName: "eip", Source: "live"})
	if src != "live" || detail != "stack eip deployed" {
		t.Fatalf("%q %q", src, detail)
	}
}
